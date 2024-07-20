require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');

const apiKey = process.env.CHAVE_GPT;

// Function to read JSON file and get expired topics
function getExpiredTopics() {
    const topics = JSON.parse(fs.readFileSync('temas.json', 'utf-8'));
    const now = moment().tz('America/Sao_Paulo');
    return topics.filter(topic => moment(topic.data, 'DD/MM/YYYY HH:mm').tz('America/Sao_Paulo').isBefore(now) && !topic.gerado);
}

// Function to update JSON file and mark topic as generated
function markTopicAsGenerated(topic) {
    const topics = JSON.parse(fs.readFileSync('temas.json', 'utf-8'));
    const updatedTopics = topics.map(t => {
        if (t.data === topic.data) {
            return { ...t, gerado: true };
        }
        return t;
    });
    fs.writeFileSync('temas.json', JSON.stringify(updatedTopics, null, 2), 'utf-8');
}

// Function to add new topic to JSON file
function addNewTopic(newTopic) {
    const topics = JSON.parse(fs.readFileSync('temas.json', 'utf-8'));
    topics.push(newTopic);
    fs.writeFileSync('temas.json', JSON.stringify(topics, null, 2), 'utf-8');
}

// Function to remove unwanted phrases from generated text
function cleanGeneratedText(text) {
    return text.replace(/\[.*?\]/g, '');
}

// Function to generate content and image using OpenAI API
async function generateContentAndImage(topic) {
    const completionResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4',
        messages: [{ role: 'user', content: topic.prompt }],
    }, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
    });
    let text = completionResponse.data.choices[0].message.content.replace("**", "");
    text = cleanGeneratedText(text);

    const imageResponse = await axios.post('https://api.openai.com/v1/images/generations', {
        prompt: topic.imagem,
        n: 1,
        size: '1024x1024'
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

module.exports = {
    getExpiredTopics,
    markTopicAsGenerated,
    addNewTopic,
    generateContentAndImage
};
