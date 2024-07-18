require('dotenv').config();
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');

const accessToken = process.env.ACCESS_TOKEN;
const apiKey = process.env.CHAVE_GPT;
const app = express();
const port = 3051;

app.use(express.json());

// Function to read JSON file and get expired topics
function getExpiredTopics() {
    const topics = JSON.parse(fs.readFileSync('data/temas.json', 'utf-8'));
    const now = moment().tz('America/Sao_Paulo');
    return topics.filter(topic => moment(topic.data, 'DD/MM/YYYY HH:mm').tz('America/Sao_Paulo').isBefore(now) && !topic.gerado);
}

// Function to update JSON file and mark topic as generated
function markTopicAsGenerated(topic) {
    const topics = JSON.parse(fs.readFileSync('data/temas.json', 'utf-8'));
    const updatedTopics = topics.map(t => {
        if (t.data === topic.data) {
            return { ...t, gerado: true };
        }
        return t;
    });
    fs.writeFileSync('data/temas.json', JSON.stringify(updatedTopics, null, 2), 'utf-8');
}

// Function to add new topic to JSON file
function addNewTopic(newTopic) {
    const topics = JSON.parse(fs.readFileSync('data/temas.json', 'utf-8'));
    topics.push(newTopic);
    fs.writeFileSync('data/temas.json', JSON.stringify(topics, null, 2), 'utf-8');
}

// Function to remove unwanted phrases from generated text
function cleanGeneratedText(text) {
    return text.replace(/\[.*?\]/g, '');
}

// Function to get LinkedIn ID
async function getLinkedinId() {
    const response = await axios.get('https://api.linkedin.com/v2/me', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'cache-control': 'no-cache',
            'X-Restli-Protocol-Version': '2.0.0'
        }
    });
    return response.data.id;
}

// Function to generate content and image using OpenAI API
async function generateContentAndImage(prompt) {
    const completionResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
    }, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
    });

    let text = completionResponse.data.choices[0].message.content;
    text = cleanGeneratedText(text);

    const imageResponse = await axios.post('https://api.openai.com/v1/images/generations', {
        prompt: text.slice(0, 1000), // Ensure prompt length is within the limit
        n: 1,
        size: '1024x1024',
    }, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
    });

    const imageUrl = imageResponse.data.data[0].url;
    const timestamp = moment().tz('America/Sao_Paulo').format('YYYY-MM-DD_HH-mm-ss');
    const directory = path.join('outputs', `output_${timestamp}`);
    fs.mkdirSync(directory, { recursive: true });

    const imagePath = path.join(directory, 'image.png');
    const textPath = path.join(directory, 'text.txt');

    const imageStream = fs.createWriteStream(imagePath);
    const imageRequest = await axios({
        url: imageUrl,
        method: 'GET',
        responseType: 'stream',
    });

    imageRequest.data.pipe(imageStream);

    fs.writeFileSync(textPath, text, 'utf-8');

    return new Promise((resolve, reject) => {
        imageStream.on('finish', () => resolve({ text, imagePath }));
        imageStream.on('error', reject);
    });
}

// Function to register image upload
async function registerImageUpload(ownerId) {
    const response = await axios.post('https://api.linkedin.com/v2/assets?action=registerUpload', {
        registerUploadRequest: {
            owner: `urn:li:person:${ownerId}`,
            recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
            serviceRelationships: [
                {
                    identifier: 'urn:li:userGeneratedContent',
                    relationshipType: 'OWNER',
                },
            ],
        },
    }, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
    });

    const uploadUrl = response.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
    const asset = response.data.value.asset;

    return { uploadUrl, asset };
}

// Function to upload image to LinkedIn
async function uploadImage(uploadUrl, imagePath) {
    const form = new FormData();
    form.append('file', fs.createReadStream(imagePath));

    await axios.post(uploadUrl, form, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            ...form.getHeaders(),
        },
    });

    console.log('Image uploaded.');
}

// Function to create a post with image
async function createPost(ownerId, imageAsset, title, text) {
    const response = await axios.post('https://api.linkedin.com/v2/ugcPosts', {
        author: `urn:li:person:${ownerId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
            'com.linkedin.ugc.ShareContent': {
                shareCommentary: {
                    text: text,
                },
                shareMediaCategory: 'IMAGE',
                media: [
                    {
                        status: 'READY',
                        description: {
                            text: text,
                        },
                        media: imageAsset,
                        title: {
                            text: title,
                        },
                    },
                ],
            },
        },
        visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
    }, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
    });

    return response.data;
}

// Main function to execute the process
async function main() {
    try {
        console.log('Starting process...');
        const expiredTopics = getExpiredTopics();

        if (expiredTopics.length === 0) {
            console.log('No expired topics found.');
            return;
        }

        const ownerId = await getLinkedinId();

        for (const topic of expiredTopics) {
            console.log(`Processing topic with date and time: ${topic.data}`);
            const { text, imagePath } = await generateContentAndImage(topic.prompt);
            const { uploadUrl, asset } = await registerImageUpload(ownerId);
            await uploadImage(uploadUrl, imagePath);
            const postId = await createPost(ownerId, asset, topic.assunto, text);
            markTopicAsGenerated(topic);

            console.log(`Post created successfully.`);
            console.log(JSON.stringify(postId));
        }
    } catch (error) {
        console.error('Error creating post:', error.response ? error.response.data : error.message);
    }
}

// Add new topic endpoint
app.post('/add', (req, res) => {
    const { data, assunto, prompt } = req.body;
    if (!data || !assunto || !prompt) {
        return res.status(400).send('Missing required fields: data, assunto, prompt');
    }

    const newTopic = {
        data,
        assunto,
        prompt,
        gerado: false
    };

    addNewTopic(newTopic);
    res.status(201).send('New topic added successfully');
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

// Execute the main function periodically (e.g., every hour)
setInterval(main, 3600000); // 3600000 ms = 1 hour

setTimeout(() => {
    main();    
}, 15000);
