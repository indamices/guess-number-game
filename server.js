const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    const roomId = req.query.roomId; // Get roomId from query parameters
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const rooms = {}; // 房间列表

function generateRoomId() {
    return Math.random().toString(36).substring(2, 7);
}

function generateRandomNumber() {
    const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    let number = '';
    for (let i = 0; i < 4; i++) {
        const index = Math.floor(Math.random() * digits.length);
        number += digits.splice(index, 1)[0];
    }
    return number;
}

function calculateResult(guess, target) {
    let a = 0, b = 0;
    for (let i = 0; i < 4; i++) {
        if (guess[i] === target[i]) {
            a++;
        } else if (target.includes(guess[i])) {
            b++;
        }
    }
    return `${a}A${b}B`;
}

io.on('connection', (socket) => {
    console.log('一个玩家连接了:', socket.id);

    let roomId = null;

    socket.on('createRoom', () => {
        roomId = generateRoomId(); // 生成唯一的房间 ID
        rooms[roomId] = {
            roomId: roomId,
            players: [],
            targetNumber: null,
            currentPlayerIndex: null,
            gameStarted: false,
            creatorId: socket.id // Store creator's socket ID
        };

        // 加入房间
        rooms[roomId].players.push(socket.id);
        socket.join(roomId); // 加入 Socket.IO 房间
        console.log(`Player ${socket.id} created and joined room ${roomId}`);

        // 发送房间创建成功事件, including creatorId
        socket.emit('roomCreated', { roomId: roomId, creatorId: rooms[roomId].creatorId });

        // 发送房间信息更新
        io.to(roomId).emit('roomUpdate', {
            roomId: roomId,
            players: rooms[roomId].players,
        });
    });


    socket.on('disconnect', () => {
        console.log('玩家断开连接:', socket.id);
        // 处理玩家离开房间的逻辑
        for (const id in rooms) {
            const index = rooms[id].players.indexOf(socket.id);
            if (index !== -1) {
                rooms[id].players.splice(index, 1);
                if (rooms[id].players.length === 0) {
                    delete rooms[id];
                    console.log(`Room ${id} is empty and has been deleted.`);
                } else {
                    io.to(id).emit('roomUpdate', {
                        roomId: id,
                        players: rooms[id].players,
                    });
                }
                break;
            }
        }
    });

    // 监听玩家猜测
    socket.on('guess', (guess) => {
        if (!roomId || socket.id !== rooms[roomId].players[rooms[roomId].currentPlayerIndex]) return;

        const result = calculateResult(guess, rooms[roomId].targetNumber);
        const playerIndex = rooms[roomId].players.indexOf(socket.id);
        const playerRole = playerIndex === 0 ? 'player1' : 'player2';

        io.to(roomId).emit('guess-result', {
            player: playerRole,
            guess: guess,
            result: result
        });

        if (result === '4A0B') {
            io.to(roomId).emit('game-over', {
                winner: socket.id,
                targetNumber: rooms[roomId].targetNumber
            });
            return;
        }

        // 切换玩家
        rooms[roomId].currentPlayerIndex = (rooms[roomId].currentPlayerIndex + 1) % 2;
        const currentPlayer = rooms[roomId].players[rooms[roomId].currentPlayerIndex];
        const otherPlayer = rooms[roomId].players[(rooms[roomId].currentPlayerIndex + 1) % 2];

        io.to(currentPlayer).emit('your-turn');
        io.to(otherPlayer).emit('wait-for-opponent');
    });

    socket.on('joinRoom', ({ roomId: roomIdToJoin }) => {
        roomId = roomIdToJoin;
        if (!rooms[roomId]) {
            socket.emit('message', '房间不存在');
            return;
        }
        if (rooms[roomId].gameStarted) {
            socket.emit('message', '游戏已开始，无法加入');
            return;
        }

        // 加入房间
        rooms[roomId].players.push(socket.id);
        socket.join(roomId); // 加入 Socket.IO 房间
        console.log(`Player ${socket.id} joined room ${roomId}`);

       // 通知房主有玩家加入，等待开始
        io.to(roomId).emit('message', '等待房主开始游戏...');

        // 发送房间信息更新
        io.to(roomId).emit('roomUpdate', {
            roomId: roomId,
            players: rooms[roomId].players,
        });
    });

    socket.on('startGame', () => {
        if (!roomId) {
            socket.emit('message', '房间ID 未定义，请重新创建或加入房间');
            return;
        }
        if (rooms[roomId].creatorId !== socket.id) {
            socket.emit('message', '只有房主才能开始游戏');
            return;
        }
        if (rooms[roomId].players.length < 2) {
            io.to(roomId).emit('message', '至少需要 2 名玩家才能开始游戏');
            return;
        }
        startGame(roomId);
    });
});

function startGame(roomId) {
    rooms[roomId].targetNumber = generateRandomNumber();
    rooms[roomId].gameStarted = true;
    rooms[roomId].currentPlayerIndex = Math.random() < 0.5 ? 0 : 1;
    const currentPlayer = rooms[roomId].players[rooms[roomId].currentPlayerIndex];
    const otherPlayer = rooms[roomId].players[(rooms[roomId].currentPlayerIndex + 1) % 2];

    io.to(currentPlayer).emit('your-turn');
    io.to(otherPlayer).emit('wait-for-opponent');

    // 发送 game-start 事件，包含不同的消息
    io.to(currentPlayer).emit('game-start', { message: '游戏开始！轮到你猜了' });
    io.to(otherPlayer).emit('game-start', { message: '游戏开始！请等待对方猜测' });
}

server.listen(3000, () => {
    console.log('服务器运行在 http://localhost:3000');
});

console.log('静态文件路径:', path.join(__dirname, 'public'));
