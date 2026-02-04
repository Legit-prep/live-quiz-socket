const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});

// MEMORY STATE
// roomState[pin] = { 
//    active: bool,
//    endTime: number, 
//    currentData: object,
//    correctOption: 'A', 
//    players: { 'Rahul': { id: 'socket1', score: 0, answer: 'A' } } 
// }
let roomState = {}; 

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // 1. SETUP SESSION
    socket.on('create_session', (pin) => {
        socket.join(pin);
        // Reset or Initialize Room
        if(!roomState[pin]) {
            roomState[pin] = { 
                active: false, 
                endTime: 0, 
                currentData: null, 
                correctOption: null, 
                players: {} 
            };
        }
        console.log(`Session created: ${pin}`);
    });

    // 2. STUDENT JOINS (Includes Late Join Logic)
    socket.on('join_session', (data) => {
        socket.join(data.pin);
        
        // Init Room if missing
        if(!roomState[data.pin]) {
            roomState[data.pin] = { active: false, endTime: 0, currentData: null, correctOption: null, players: {} };
        }
        
        // Init Player (Persist score by Name)
        let player = roomState[data.pin].players[data.name];
        if (!player) {
            roomState[data.pin].players[data.name] = { id: socket.id, score: 0, answer: null };
        } else {
            player.id = socket.id; // Update socket on reconnect
        }

        // Update count
        io.to(data.pin).emit('update_count', Object.keys(roomState[data.pin].players).length);

        // --- LATE JOIN SYNC ---
        // If a question is currently active, send it to this specific student immediately
        const state = roomState[data.pin];
        if (state && state.active) {
            const now = Date.now();
            const remainingTime = Math.ceil((state.endTime - now) / 1000);

            if (remainingTime > 0) {
                // Send the ACTIVE question to this specific late student
                socket.emit('question_started', {
                    ...state.currentData,
                    time: remainingTime // Override with ACTUAL remaining time
                });
            }
        }
    });

    // 3. START QUESTION
    socket.on('start_timer', (data) => {
        if(!roomState[data.pin]) return;
        
        // Update State
        roomState[data.pin].active = true;
        roomState[data.pin].currentData = data;
        roomState[data.pin].correctOption = data.correctOption; 
        roomState[data.pin].endTime = Date.now() + (data.time * 1000) + 1000; // Buffer for latency
        
        // Reset Player Answers for this new round
        for (let name in roomState[data.pin].players) {
            roomState[data.pin].players[name].answer = null;
        }

        // Broadcast to everyone
        io.to(data.pin).emit('question_started', data);
    });

    // 4. RECEIVE ANSWER (Live Graph)
    socket.on('submit_answer', (data) => {
        // data: { pin, name, answer }
        if (roomState[data.pin] && roomState[data.pin].players[data.name]) {
            roomState[data.pin].players[data.name].answer = data.answer;
            // Send to Instructor for Bar Graph
            io.to(data.pin).emit('receive_answer', data.answer); 
        }
    });

    // 5. TIME UP & SCORING
    socket.on('time_up', (pin) => {
        let state = roomState[pin];
        if (!state) return;

        // Mark inactive so late joiners don't see an old question
        state.active = false;

        let correct = state.correctOption;
        let leaderboard = [];

        // Calculate Scores
        for (let name in state.players) {
            let p = state.players[name];
            let isCorrect = (p.answer === correct);
            
            if (isCorrect) p.score += 10; // +10 Points for correct answer

            // Send Result to Individual Student (Red/Green Screen)
            io.to(p.id).emit('question_result', {
                correct: isCorrect,
                score: p.score,
                correctOption: correct
            });

            leaderboard.push({ name: name, score: p.score });
        }

        // Sort Top 5
        leaderboard.sort((a, b) => b.score - a.score);
        let top5 = leaderboard.slice(0, 5);

        // Send Leaderboard to Instructor
        io.to(pin).emit('leaderboard_update', top5);
    });

    // 6. FINAL REPORT (Excel Export)
    socket.on('request_final_data', (pin) => {
        let state = roomState[pin];
        if (!state) return;

        let fullList = [];
        for (let name in state.players) {
            fullList.push({ name: name, score: state.players[name].score });
        }
        
        // Send full list back to Instructor ONLY (for saving to DB)
        io.to(socket.id).emit('final_data_sent', fullList);
    });

    // 7. CLEANUP
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 8080; 
server.listen(PORT, () => { console.log(`Server running on ${PORT}`); });
