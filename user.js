require('dotenv').config();

const { AccessToken } = require('simple-web-tokens');
const prisma = require('./prisma');

async function getUserFromAccessToken(accessToken) {
    try {
        const at = await AccessToken.parse(accessToken, process.env.SECRET);
        if (!at || !at.userId) return null;
        return await prisma.user.findUnique({
            where: {
                id: at.userId,
            },
        });
    } catch (e) {
        console.log(e);
        return null;
    }
}

module.exports = {
    getUserFromAccessToken,
};
