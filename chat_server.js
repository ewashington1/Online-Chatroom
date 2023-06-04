// Require the packages we will use:
const http = require("http"),
    fs = require("fs");

const port = 3456;
const file = "client.html";
// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html, on port 3456:
const server = http.createServer(function (req, res) {
    // This callback runs when a new connection is made to our HTTP server.
    fs.readFile(file, function (err, data) {
        // This callback runs when the client.html file has been read from the filesystem.

        if (err) return res.writeHead(500);
        res.writeHead(200);
        res.end(data);
    });
});

server.listen(port);

let allRooms = {};
let allUsernames = [];
let userSockets = {};

// to list out people in rooms
// for each user check what room

// To kick someone
// let kickingPersonsSocket = allUsersAndSockets[(username of person were kicking)];
// kickingPersonsSocket.leave(allUsersAndRooms['username']);

// adding socket to dict
// after a .join
// allUsersAndSockets.append({username: socket})

//if user joins back into a room that they created, it should change the delete button to allow them to delete that room

//they can only delete if they "own" the room


// Import Socket.IO and pass our HTTP server object to it.
const socketio = require("socket.io")(http, {
    wsEngine: 'ws'
});

// Attach our Socket.IO server to our HTTP server to listen
const io = socketio.listen(server);
io.on("connection", function (socket) {
    // broadcasting all rooms to current user
    let oneTimeUsername = "";
    let oneTimeRoomName = "";

    socket.emit("rooms_to_client", allRooms);

    // This callback runs when a new Socket.IO connection is established.
    socket.on('message_to_server', function (data) {
        // This callback runs when the server receives a new message from the client.
        console.log("username: " + data["username"] + " message: " + data["message"] + " room: " + data["room"]); // log it to the Node.JS output
        // If your in a room send the message, if not send an error
        if (allRooms.hasOwnProperty(data["room"]) && allRooms[data["room"]].users.includes(data["username"])) {
            let room = allRooms[data['room']]
            room.messages.push(data["username"] + ": " + data["message"]);
            data["sent"] = true;
            io.to(data["room"]).emit("message_to_client", data) // broadcast the message to other users
        } else {
            data["sent"] = false;
            socket.emit("message_to_client", { message: "You're not in a room." })
        }
    });

    socket.on('newUser', function (username) {
        // const regEx = /[a-zA-Z]/;
        // if (!regEx.test(username) || username == null || allUsernames.includes(username)) {
        //     socket.emit("invalid_username", "Username is invalid or taken");
        // } else {
            allUsernames.push(username);
            userSockets[username] = socket;
            oneTimeUsername = username;
        //}
    })

    // when trying to create new room
    socket.on("newRoom_to_server", function (data) {
        let room = data["room"];
        if (!allRooms.hasOwnProperty(room.name)) {
            if (allRooms.hasOwnProperty(data["oldRoom"]) && allRooms[data["oldRoom"]].users.includes(data["username"])) {
                leaveRoom({ roomName: data["oldRoom"], username: data["username"] });
            }
            socket.join(room.name);
            allRooms[room.name] = room;
            console.log(`User ${room.owner} created room ${room.name}`);
            io.emit("newRoom_to_client", room);
            socket.emit("room_to_client", { inRoom: true, room: room });
            io.to(room.name).emit("users_to_client", room);
            socket.emit("owner_actions_to_client", room.name);
            socket.emit("create_leave_to_client", room);
            oneTimeRoomName = room.name;
        } else {
            socket.emit("room_to_client", { inRoom: false, message: "Room name is taken." });
        }
    });

    // leave room creative portion
    // unban
    //joint ownership of chatroom -- owner can't kick other owner  
    //custom ban messages  
    //friends list
    //users online
    //emoji selection for chat

    // when trying to join room
    socket.on("roomName_to_server", function (data) {
        if (allRooms.hasOwnProperty(data["roomName"]) && !allRooms[data["roomName"]].users.includes(data["username"]) && allRooms[data["roomName"]].password == data["password"]) {
            // leaving previous room
            if (allRooms[data['roomName']].banned.includes(data['username'])) {
                socket.emit("alert_message", "You're banned from room " + data['roomName']);
                return;
            }
            if (allRooms.hasOwnProperty(data["oldRoom"]) && data["oldRoom"] != data["roomName"] && allRooms[data["oldRoom"]].users.includes(data["username"])) {
                leaveRoom({ roomName: data["oldRoom"], username: data["username"] });
            }
            let room = allRooms[data["roomName"]];
            socket.join(room.name);
            oneTimeRoomName = room.name;
            room.users.push(data["username"]);
            console.log(`User ${data["username"]} joined room ${room.name}`);
            socket.emit("room_to_client", { inRoom: true, room: room });
            io.in(room.name).emit("users_to_client", room);
            data["room"] = room;
            //data["inRoom"] = true; 
            socket.emit("messages_to_client", data);
            if (room.owner == data['username']) {
                socket.emit("owner_actions_to_client", room.name);
            }
            socket.emit("create_leave_to_client", room);
        } else {
            if (!allRooms.hasOwnProperty(data["roomName"])) {
                socket.emit("room_to_client", { inRoom: false, message: "Room doesn't exist." });
            } else if (allRooms[data["roomName"]].users.includes(data["username"])) {
                socket.emit("room_to_client", { inRoom: false, message: "You're already in that room." });
            } else {
                socket.emit("room_to_client", { inRoom: false, message: "Wrong password." });
            }
        }
    });


    // deleting the room
    socket.on("delete_room", function (roomName) {
        io.to(roomName).emit("deletionCompleted", { message: roomName + " has been deleted", allRooms: allRooms });
        //kick all users in room out
        for (let user of allRooms[roomName].users) {
            if (userSockets[user] != null) {
                console.log(`${user}: has left because of deletion`);
                userSockets[user].leave(roomName);
                userSockets[user].emit("leaveCompleted");
            }
        }
        delete allRooms[roomName];
        io.emit("rooms_to_client", allRooms);
        console.log(`${roomName} has been deleted`);
        //clear the room object when deleted.
    });

    // leaving the room
    socket.on("leave_room", function (data) {
        leaveRoom({ roomName: data["roomName"], username: data["username"] });
    });

    function leaveRoom(data) {
        let room = allRooms[data["roomName"]];
        let leaveSocket = userSockets[data["username"]];
        if (room != null && leaveSocket != null) { // && leaveSocket != null
            let index = room.users.indexOf(data["username"]);
            room.users.splice(index, 1);
            leaveSocket.leave(room.name);
            console.log(room.users);
            console.log(`User ${data["username"]} left room ${room.name}`);
            leaveSocket.emit("leaveCompleted");
        }
        io.to(data["roomName"]).emit("users_to_client", room);
    }

    // trying to kick a user
    socket.on("kickUser", function (data) { //passed nameToKick, roomName
    let kicked = false;
    for (let user of allRooms[data["roomName"]].users) {
        if (user == data["nameToKick"]) {
            kicked = true;
            userSockets[data["nameToKick"]].emit("alert_message", "You have been kicked from room " + data["roomName"]);
            socket.emit("alert_message", "You have kicked " + data["nameToKick"] + " from room " + data["roomName"]);
            leaveRoom({ roomName: data["roomName"], username: data["nameToKick"] });
            console.log(`User ${data["nameToKick"]} has been kicked out of room ${data["roomName"]}`);
        }
    }
    if (!kicked) {
        socket.emit("alert_message", "They are not in the room");
    }
});

socket.on("banUser", function (data) { //passed nameToBan, roomName
    let banned = false;
    let banningOwner = false;
    if (allRooms[data['roomName']].banned.includes(data['nameToBan'])) {
        socket.emit("alert_message", "You've already banned this user.");
        banned = true;
    }
    for (let user of allRooms[data["roomName"]].users) {
        if (user == data["nameToBan"] && user == data["username"]) {
            banningOwner = true;
        }
        if (user == data["nameToBan"] && user != data["username"]) {
            banned = true;
            allRooms[data["roomName"]].banned.push(data["nameToBan"]);
            userSockets[data["nameToBan"]].emit("alert_message", "You have been banned from room " + data["roomName"]);
            socket.emit("alert_message", "You have banned " + data["nameToBan"] + " from room " + data["roomName"]);
            leaveRoom({ roomName: data["roomName"], username: data["nameToBan"] });
            console.log(`User ${data["nameToBan"]} has been banned from room ${data["roomName"]}`);
            console.log(data["roomName"] + " users list is " + allRooms[data["roomName"]].users);
        }
    }
    if (!banned && !banningOwner) {
        socket.emit("alert_message", "They are not in the room");
    } else if (banningOwner) {
        socket.emit("alert_message", "You cannot ban yourself");
    }
});

socket.on("unbanUser", function (data) { //passed nameToUnban, roomName, username
    let banned = true;
    if (allRooms[data['roomName']].banned.includes(data['nameToUnban'])) {
        let index = allRooms[data['roomName']].banned.indexOf(data['nameToUnban']);
        allRooms[data['roomName']].banned.splice(index, 1);
        socket.emit("alert_message", data['nameToUnban'] + " was unbanned.");
        userSockets[data["nameToUnban"]].emit("alert_message", "You have been unbanned from room " + data["roomName"]);
        banned = false;
    }
    else {
        socket.emit("alert_message", "The user you entered isn't banned from " + data['roomName']);
    }
});

socket.on("private_message", function (data) {
    const room = allRooms[data["roomName"]];
    if (room != null && room.users.includes(data["userPMTo"]) && data["userPMTo"] != data["userPMFrom"]) {
        io.to(userSockets[data["userPMTo"]].id).emit("message_to_client", { sent: true, username: `(Private) ${data["userPMFrom"]}`, message: data['message'] });
        socket.emit("message_to_client", { sent: true, username: `(Private) ${data["userPMFrom"]}`, message: data['message'] });
        console.log(`User ${data["userPMFrom"]} pm'd ${data["userPMTo"]}`);
    } else {
        if (data["userPMTo"] == data["userPMFrom"]) {
            socket.emit("alert_message", "Cannot PM yourself");
        } else {
            socket.emit("alert_message", "They are not in the room");
        }
    }
});

socket.on("disconnect", function () {
    leaveRoom({ roomName: oneTimeRoomName, username: oneTimeUsername });
    let index = allUsernames.indexOf(oneTimeUsername);
    allUsernames.splice(index, 1);
    console.log(oneTimeUsername + " has left the server");
    console.log(allUsernames);
});

});