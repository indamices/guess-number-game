const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*', // 允许跨域访问
        methods: ['GET', 'POST'],
    },
});

// 使用 Render 的动态端口
const port = process.env.PORT || 3000;

// 配置静态文件目录
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 游戏状态管理类
class Game {
    constructor() {
        this.targetNumber = this.generateRandomNumber(); // 随机生成目标数字
        this.players = {};
        this.currentPlayer = null;
        this.guesses = [];
        this.restartRequests = new Set();
    }

    // 随机生成一个四位不重复的数字
    generateRandomNumber() {
        const digits = [];
        while (digits.length < 4) {
            const randomDigit = Math.floor(Math.random() * 10); // 生成 0-9 的随机数
            if (!digits.includes(randomDigit)) {
                digits.push(randomDigit);
            }
        }
        return digits.join(''); // 返回字符串形式的四位数字
    }

    calculateResult(guess, target) {
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

    reset() {
        this.targetNumber = this.generateRandomNumber(); // 重新生成随机目标数字
        this.currentPlayer = null;
        this.guesses = [];
        this.restartRequests = new Set();
        console.log('游戏已重置，目标数字为:', this.targetNumber);
    }
}

let game = new Game();

io.on('connection', (socket) => {
    console.log('一个玩家连接了:', socket.id);

    // 分配玩家角色
    if (!game.players.player1) {
        game.players.player1 = socket.id;
        socket.emit('role', 'player1');
    } else if (!game.players.player2) {
        game.players.player2 = socket.id;
        socket.emit('role', 'player2');
    }

    // 两位玩家都连接后开始游戏
    if (Object.keys(game.players).length === 2 && !game.currentPlayer) {
        startGame();
    }

    // 玩家提交猜测
    socket.on('guess', (guess) => {
        if (socket.id !== game.currentPlayer) return;

        const result = game.calculateResult(guess, game.targetNumber);
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
            return;
        }

        game.currentPlayer = game.currentPlayer === game.players.player1 ? game.players.player2 : game.players.player1;
        const otherPlayer = game.currentPlayer === game.players.player1 ? game.players.player2 : game.players.player1;

        io.to(game.currentPlayer).emit('your-turn');
        io.to(otherPlayer).emit('wait-for-opponent');
    });

    // 玩家请求再来一局
    socket.on('restart-game', () => {
        game.restartRequests.add(socket.id);
        socket.emit('waiting-for-opponent');

        const otherPlayerSocketId = socket.id === game.players.player1 ? game.players.player2 : game.players.player1;
        io.to(otherPlayerSocketId).emit('opponent-waiting-for-restart');

        // 如果两位玩家都请求再来一局，重新开始游戏
        if (game.restartRequests.size === 2) {
            game.reset();
            io.emit('game-restarted');
        }
    });

    // 玩家退出游戏
    socket.on('exit-game', () => {
        const playerRole = socket.id === game.players.player1 ? 'player1' : 'player2';
        const otherPlayerSocketId = playerRole === 'player1' ? game.players.player2 : game.players.player1;

        socket.emit('show-waiting');
        io.to(otherPlayerSocketId).emit('opponent-exited');
        game.reset();
    });

    // 玩家断开连接
    socket.on('disconnect', () => {
        console.log('玩家断开连接:', socket.id);

        if (socket.id === game.players.player1) {
            delete game.players.player1;
        } else if (socket.id === game.players.player2) {
            delete game.players.player2;
        }

        if (Object.keys(game.players).length < 2) {
            const remainingPlayer = game.players.player1 || game.players.player2;
            if (remainingPlayer) {
                io.to(remainingPlayer).emit('opponent-disconnected');
            }
            game.reset();
        }
    });
});

// 开始游戏
function startGame() {
    if (Object.keys(game.players).length === 2) {
        game.currentPlayer = Math.random() < 0.5 ? game.players.player1 : game.players.player2;
        const otherPlayer = game.currentPlayer === game.players.player1 ? game.players.player2 : game.players.player1;

        io.to(game.currentPlayer).emit('your-turn');
        io.to(otherPlayer).emit('wait-for-opponent');
        io.emit('game-start');
    } else {
        console.log('等待另一位玩家加入...');
    }
}

// 启动服务器
server.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
});
