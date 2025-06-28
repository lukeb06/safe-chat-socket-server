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

    socket.on('authenticate', async ({ accessToken, channelName }) => {
        const user = await getUserFromAccessToken(accessToken);
        if (user) {
            SOCKET_USER_MAP.set(socket.id, user);
            if (!USER_SOCKETS_MAP.has(user.id)) USER_SOCKETS_MAP.set(user.id, []);
            USER_SOCKETS_MAP.get(user.id).push(socket);
        }

        socket.join(channelName);
    });

    socket.on('chat message', async data => {
        const { accessToken, channelName, message } = data;
        const user = await getUserFromAccessToken(accessToken);
        if (!user) return socket.emit('error', 'An error occurred');
        const newMessage = await prisma.message.create({
            data: {
                authorId: user.id,
                channelName,
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

        io.to(channelName).emit('chat message', response);
    });

    socket.on('delete message', async ({ accessToken, messageId }) => {
        const user = await getUserFromAccessToken(accessToken);
        if (!user) return socket.emit('error', 'An error occurred');
        const message = await prisma.message.findUnique({
            where: {
                id: messageId,
            },
        });

        if (!message) return socket.emit('error', 'This message does not exist');

        if (message.authorId !== user.id)
            return socket.emit('error', 'You do not have permission to delete this message');

        await prisma.message.delete({
            where: {
                id: messageId,
            },
        });

        io.emit('delete message', messageId);
    });

    socket.on('edit message', ({ accessToken, messageId, newContent }) => {
        const user = getUserFromAccessToken(accessToken);
        if (!user) return socket.emit('error', 'An error occurred');
        const message = prisma.message.findUnique({
            where: {
                id: messageId,
            },
        });

        if (!message) return socket.emit('error', 'This message does not exist');

        if (message.authorId !== user.id)
            return socket.emit('error', 'You do not have permission to edit this message');
        io.emit('edit message', { messageId, newContent });
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
