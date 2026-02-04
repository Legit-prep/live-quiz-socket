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
//    correctOption: 'A', 
//    players: { 'Rahul': { id: 'socket1', score: 0, answer: 'A' } } 
// }
let roomState = {}; 

io.on('connection', (socket) => {
    
    // 1. SETUP
    socket.on('create_session', (pin) => {
        socket.join(pin);
        if(!roomState[pin]) roomState[pin] = { players: {}, correctOption: null };
    });

    socket.on('join_session', (data) => {
        socket.join(data.pin);
        
        // Init Room
        if(!roomState[data.pin]) roomState[data.pin] = { players: {}, correctOption: null };
        
        // Init Player (Persist score by Name)
        let player = roomState[data.pin].players[data.name];
        if (!player) {
            roomState[data.pin].players[data.name] = { id: socket.id, score: 0, answer: null };
        } else {
            player.id = socket.id; // Update socket on reconnect
        }

        // Update count
        io.to(data.pin).emit('update_count', Object.keys(roomState[data.pin].players).length);
    });

    // 2. START QUESTION
    socket.on('start_timer', (data) => {
        if(!roomState[data.pin]) return;
        
        // Store Correct Option
        roomState[data.pin].correctOption = data.correctOption; 
        
        // Reset Player Answers for this round
        for (let name in roomState[data.pin].players) {
            roomState[data.pin].players[name].answer = null;
        }

        io.to(data.pin).emit('question_started', data);
    });

    // 3. RECEIVE ANSWER
    socket.on('submit_answer', (data) => {
        // data: { pin, name, answer }
        if (roomState[data.pin] && roomState[data.pin].players[data.name]) {
            roomState[data.pin].players[data.name].answer = data.answer;
            // Update Graph
            io.to(data.pin).emit('receive_answer', data.answer); 
        }
    });

    // 4. TIME UP & CALCULATE SCORES (The Magic Part)
    socket.on('time_up', (pin) => {
        let state = roomState[pin];
        if (!state) return;

        let correct = state.correctOption;
        let leaderboard = [];

        // Calculate Scores
        for (let name in state.players) {
            let p = state.players[name];
            let isCorrect = (p.answer === correct);
            
            if (isCorrect) p.score += 10; // +10 Points

            // Send Result to Individual Student
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
});

const PORT = process.env.PORT || 8080; 
server.listen(PORT, () => { console.log(`Server running on ${PORT}`); });
