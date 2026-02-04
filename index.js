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
        // Notify instructor to update student count
        const room = io.sockets.adapter.rooms.get(data.pin);
        const count = room ? room.size : 0;
        io.to(data.pin).emit('update_count', count);
    });

    // 3. INSTRUCTOR: Starts Question & Timer
    socket.on('start_timer', (data) => {
        // Broadcast the full data packet (Question + Options + Time) to everyone in the room
        io.to(data.pin).emit('question_started', data);
    });

    // 4. STUDENT: Submits Answer (NEW FEATURE FOR LIVE GRAPH)
    socket.on('submit_answer', (data) => {
        // data looks like: { pin: '12345', answer: 'A' }
        
        // We broadcast this specific answer back to the room.
        // The Instructor screen will listen for 'receive_answer' and increase the bar graph.
        io.to(data.pin).emit('receive_answer', data.answer); 
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 8080; 
server.listen(PORT, () => {
    console.log(`Socket Server running on port ${PORT}`);
});
