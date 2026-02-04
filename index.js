const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

let sessions = {}; 

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // 1. INSTRUCTOR: Creates/Starts a Session Room
    socket.on('create_session', (pin) => {
        socket.join(pin);
        console.log(`Session created: ${pin}`);
    });

    // 2. STUDENT: Joins the Room
    socket.on('join_session', (data) => {
        socket.join(data.pin);
        // Notify instructor
        const room = io.sockets.adapter.rooms.get(data.pin);
        const count = room ? room.size : 0;
        io.to(data.pin).emit('update_count', count);
    });

    // 3. INSTRUCTOR: Starts Question Timer (THE CRITICAL FIX IS HERE)
    socket.on('start_timer', (data) => {
        // OLD CODE: io.to(data.pin).emit('question_started', { time: data.time }); 
        // NEW CODE: Pass the WHOLE data packet (Question + Options + Time)
        io.to(data.pin).emit('question_started', data);
    });

    // 4. STUDENT: Submits Answer
    socket.on('answer_submitted', (pin) => {
        io.to(pin).emit('new_answer_received'); 
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 8080; // Default to 8080 for Railway
server.listen(PORT, () => {
    console.log(`Socket Server running on port ${PORT}`);
});
