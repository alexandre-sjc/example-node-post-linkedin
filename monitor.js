require('dotenv').config();
const axios = require('axios');

const accessToken = process.env.ACCESS_TOKEN;

// Function to get the list of connections
async function getConnections() {
    const response = await axios.get('https://api.linkedin.com/v2/connections?q=viewer&start=0&count=50', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'cache-control': 'no-cache',
            'X-Restli-Protocol-Version': '2.0.0'
        }
    });
    return response.data.elements;
}

// Function to get user profile
async function getUserProfile() {
    const response = await axios.get(`https://api.linkedin.com/v2/me`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'cache-control': 'no-cache',
            'X-Restli-Protocol-Version': '2.0.0'
        }
    });
    return response.data;
}

// Function to get posts from a specific user
async function getUserPosts(userId) {
    const response = await axios.get(`https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(urn:li:person:${userId})`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'cache-control': 'no-cache',
            'X-Restli-Protocol-Version': '2.0.0'
        }
    });
    return response.data.elements;
}

// Function to monitor posts from connections
async function monitorPosts() {
    try {
        const connections = await getConnections();
        for (const connection of connections) {
            const userId = connection.entityUrn.replace('urn:li:fs_miniProfile:', '');
            const profile = await getUserProfile(userId);
            console.log(`User ID: ${userId}`);
            console.log(`Profile: ${JSON.stringify(profile, null, 2)}`);
            const posts = await getUserPosts(userId);
            for (const post of posts) {
                console.log(`Post: ${JSON.stringify(post, null, 2)}`);
            }
        }
    } catch (error) {
        console.error('Error fetching posts:', error.response ? error.response.data : error.message);
    }
}

module.exports = {
    monitorPosts
};
