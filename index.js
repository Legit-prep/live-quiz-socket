const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

// Allow connections from your website ONLY
const io = new Server(server, {
    cors: {
        origin: "*", // Change this to "https://www.legitprep.in" when live for security
        methods: ["GET", "POST"]
    }
});

// Store basic session state in memory (RAM)
let sessions = {}; 
// Structure: { pin_123456: { currentSlide: 1, isLive: false, participants: 0 } }

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // 1. INSTRUCTOR: Creates/Starts a Session Room
    socket.on('create_session', (pin) => {
        socket.join(pin);
        if (!sessions[pin]) {
            sessions[pin] = { participants: 0 };
        }
        console.log(`Session created: ${pin}`);
    });

    // 2. STUDENT: Joins the Room
    socket.on('join_session', (data) => {
        // data = { pin: '123456', name: 'StudentName' }
        socket.join(data.pin);
        
        // Update participant count
        if (sessions[data.pin]) {
            sessions[data.pin].participants++;
            // Tell Instructor to update "Students Joined" counter
            io.to(data.pin).emit('update_count', sessions[data.pin].participants);
        }
    });

    // 3. INSTRUCTOR: Starts Question Timer
    socket.on('start_timer', (data) => {
        // data = { pin: '123456', time: 30 }
        io.to(data.pin).emit('question_started', { time: data.time });
    });

    // 4. STUDENT: Submits Answer (Just updates the "Answers Received" graph)
    socket.on('answer_submitted', (pin) => {
        // We don't send the ANSWER here (that goes to PHP/DB).
        // We just tell the instructor "Someone answered!"
        io.to(pin).emit('new_answer_received'); 
    });

    // 5. INSTRUCTOR: Show Leaderboard / Results
    socket.on('show_results', (pin) => {
        io.to(pin).emit('display_results');
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Socket Server running on port ${PORT}`);
});