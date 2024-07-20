require('dotenv').config();
const express = require('express');
const gpt = require('./gpt');
const post = require('./post');
const monitor = require('./monitor');

const app = express();
const port = 3051;

app.use(express.json());

app.post('/add', (req, res) => {
    const { data, assunto, prompt, imagem } = req.body;
    if (!data || !assunto || !prompt || !imagem) {
    return res.status(400).send('Missing required fields: data, assunto, prompt, and imagem');
}

const newTopic = {
    data,
    assunto,
    prompt,
    imagem,
    gerado: false
};

gpt.addNewTopic(newTopic);
res.status(201).send('New topic added successfully');
});

async function main() {
    try {
        console.log('Starting process.');
        const expiredTopics = gpt.getExpiredTopics();

        if (expiredTopics.length === 0) {
            console.log('No expired topics found.');
            return;
        }

        const ownerId = await post.getLinkedinId();

        for (const topic of expiredTopics) {
            console.log(`Processing topic with date and time: ${topic.data}`);
            const { text, imagePath } = await gpt.generateContentAndImage(topic);
            const { uploadUrl, asset } = await post.registerImageUpload(ownerId);
            await post.uploadImage(uploadUrl, imagePath);
            const postId = await post.createPost(ownerId, asset, topic.assunto, text);
            gpt.markTopicAsGenerated(topic);

            console.log(`Post created successfully.`);
            console.log(JSON.stringify(postId));
        }
    } catch (error) {
        console.error('Error creating post:', error.response ? error.response.data : error.message);
    }
}

async function startMonitoring() {
    try {
        await monitor.monitorPosts();
    } catch (error) {
        console.error('Error monitoring posts:', error.response ? error.response.data : error.message);
    }
}

app.listen(port, () => {
    console.clear();
    console.log(`Server is running on port ${port}`);
});

// Run main function periodically (e.g., every 30 minutes)
setInterval(main, 1800000); // 1800000 ms = 30 minutes
setTimeout(main, 5000); // Run main function after 5 seconds

// Run monitoring function periodically (e.g., every minute) 
// In this momento this function not work on this project. 
//setTimeout(startMonitoring, 15000); // Run monitoring function after 15 seconds
