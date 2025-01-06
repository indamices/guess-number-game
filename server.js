const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

let game = {
    targetNumber: generateRandomNumber(),
    players: {},
    currentPlayer: null,
    guesses: [],
    restartRequests: new Set(), // 用于记录请求“再来一局”的玩家
};

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

    // 初始化玩家
    if (!game.players.player1) {
        game.players.player1 = socket.id;
        socket.emit('role', 'player1');
    } else if (!game.players.player2) {
        game.players.player2 = socket.id;
        socket.emit('role', 'player2');
    }

    // 如果两个玩家都连接了，随机决定先手
    if (Object.keys(game.players).length === 2 && !game.currentPlayer) {
        startGame();
    }

    // 监听玩家猜测
    socket.on('guess', (guess) => {
        if (socket.id !== game.currentPlayer) return;

        const result = calculateResult(guess, game.targetNumber);
        const playerRole = socket.id === game.players.player1 ? 'player1' : 'player2';

        io.emit('guess-result', {
            player: playerRole,
            guess: guess,
            result: result
        });

        if (result === '4A0B') {
            io.emit('game-over', {
                winner: socket.id,
                targetNumber: game.targetNumber
            });
            return; // 不重置游戏状态
        }

        // 切换玩家
        game.currentPlayer = game.currentPlayer === game.players.player1 ? game.players.player2 : game.players.player1;
        const otherPlayer = game.currentPlayer === game.players.player1 ? game.players.player2 : game.players.player1;

        io.to(game.currentPlayer).emit('your-turn');
        io.to(otherPlayer).emit('wait-for-opponent');
    });

// 监听玩家点击“再来一局”
socket.on('restart-game', () => {
    // 记录请求“再来一局”的玩家
    game.restartRequests.add(socket.id);

    // 通知点击“再来一局”的玩家等待对方确认
    socket.emit('waiting-for-opponent');

    // 如果两位玩家都请求“再来一局”，则重新开始游戏
    if (game.restartRequests.size === 2) {
        resetGame();
        io.emit('game-restarted');
        startGame();
    }
});

    // 监听玩家点击“退出”
    socket.on('exit-game', () => {
        // 重置游戏状态
        resetGame();
        // 通知当前玩家刷新页面
        socket.emit('game-exited');
    });

    // 监听玩家断开连接
    socket.on('disconnect', () => {
        console.log('玩家断开连接:', socket.id);

        if (socket.id === game.players.player1) {
            delete game.players.player1;
        } else if (socket.id === game.players.player2) {
            delete game.players.player2;
        }

        if (Object.keys(game.players).length < 2) {
            resetGame();
            io.emit('player-disconnected');
        }
    });
});

function startGame() {
    game.currentPlayer = Math.random() < 0.5 ? game.players.player1 : game.players.player2;
    const otherPlayer = game.currentPlayer === game.players.player1 ? game.players.player2 : game.players.player1;

    io.to(game.currentPlayer).emit('your-turn');
    io.to(otherPlayer).emit('wait-for-opponent');
    io.emit('game-start');
}

function resetGame() {
    game = {
        targetNumber: generateRandomNumber(),
        players: {},
        currentPlayer: null,
        guesses: [],
        restartRequests: new Set(), // 重置“再来一局”请求记录
    };
    console.log('游戏已重置');
}

server.listen(3000, () => {
    console.log('服务器运行在 http://localhost:3000');
});

console.log('静态文件路径:', path.join(__dirname, 'public'));