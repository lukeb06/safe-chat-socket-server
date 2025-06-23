require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer();
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        // credentials: true,
        credentials: false,
    },
});

const { getUserFromAccessToken } = require('./user');
const prisma = require('./prisma');

const SOCKET_USER_MAP = new Map();
const USER_SOCKETS_MAP = new Map();

io.on('connection', socket => {
    console.log('a user connected');

    socket.on('authenticate', async accessToken => {
        const user = await getUserFromAccessToken(accessToken);
        if (user) {
            SOCKET_USER_MAP.set(socket.id, user);
            if (!USER_SOCKETS_MAP.has(user.id)) USER_SOCKETS_MAP.set(user.id, []);
            USER_SOCKETS_MAP.get(user.id).push(socket);
        }
    });

    socket.on('chat message', async data => {
        const { accessToken, userId, message } = data;
        const user = await getUserFromAccessToken(accessToken);
        console.log(accessToken, userId, message, user.id);
        if (!user || user.id === userId) return socket.emit('error', 'An error occurred');
        const recipientUser = await prisma.user.findUnique({
            where: {
                id: userId,
            },
        });

        if (!recipientUser) return socket.emit('error', 'This user does not exist');

        const newMessage = await prisma.message.create({
            data: {
                authorId: user.id,
                recipientId: userId,
                content: message,
            },
        });

        const response = {
            ...newMessage,
            author: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
            },
        };

        socket.emit('chat message', response);

        const recipientSockets = USER_SOCKETS_MAP.get(userId);
        if (!recipientSockets || recipientSockets.length === 0) return;
        recipientSockets.forEach(s => s.emit('chat message', response));
    });

    socket.on('disconnect', () => {
        const myUser = SOCKET_USER_MAP.get(socket.id);
        SOCKET_USER_MAP.delete(socket.id);

        if (!myUser) return;

        if (USER_SOCKETS_MAP.has(myUser.id)) {
            let sockets = USER_SOCKETS_MAP.get(myUser.id);
            sockets = sockets.filter(s => s.id !== socket.id);
            if (sockets.length === 0) USER_SOCKETS_MAP.delete(myUser.id);
            else USER_SOCKETS_MAP.set(myUser.id, sockets);
        }
    });
});

server.listen(process.env.PORT, () => {
    console.log(`listening on ${process.env.PORT}`);
});
