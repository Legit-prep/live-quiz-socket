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
    },
    transports: ['websocket', 'polling'], // Force WebSocket support
    pingTimeout: 60000,
    pingInterval: 25000
});

// MEMORY STORAGE
// Stores: { pin: { currentQuestion: {}, endTime: 1234567890 } }
let roomState = {}; 

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // 1. INSTRUCTOR: Creates Session
    socket.on('create_session', (pin) => {
        socket.join(pin);
        // Reset state for new session
        roomState[pin] = { active: false, data: null, endTime: 0 };
        console.log(`Session created: ${pin}`);
    });

    // 2. STUDENT: Joins (Includes Late Join Logic)
    socket.on('join_session', (data) => {
        socket.join(data.pin);
        
        // Update headcount
        const room = io.sockets.adapter.rooms.get(data.pin);
        const count = room ? room.size : 0;
        io.to(data.pin).emit('update_count', count);

        // --- LATE JOIN LOGIC ---
        const state = roomState[data.pin];
        if (state && state.active) {
            const now = Date.now();
            const remainingTime = Math.ceil((state.endTime - now) / 1000);

            if (remainingTime > 0) {
                // Send the ACTIVE question to this specific late student immediately
                console.log(`Late joiner ${socket.id} syncing to active question.`);
                socket.emit('question_started', {
                    ...state.data,
                    time: remainingTime // Override total time with ACTUAL remaining time
                });
            }
        }
    });

    // 3. INSTRUCTOR: Starts Question
    socket.on('start_timer', (data) => {
        // Save to Memory
        roomState[data.pin] = {
            active: true,
            data: data,
            endTime: Date.now() + (data.time * 1000) + 1000 // Add 1s buffer
        };

        // Broadcast to everyone
        io.to(data.pin).emit('question_started', data);
    });

    // 4. STUDENT: Submits Answer
    socket.on('submit_answer', (data) => {
        io.to(data.pin).emit('receive_answer', data.answer); 
    });

    // 5. INSTRUCTOR: Ends/Clears Question state
    socket.on('stop_timer', (pin) => {
        if(roomState[pin]) {
            roomState[pin].active = false;
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 8080; 
server.listen(PORT, () => {
    console.log(`Socket Server running on port ${PORT}`);
});
