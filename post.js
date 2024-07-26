require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const accessToken = process.env.ACCESS_TOKEN;

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
                    text: text.replace(/[*`]/g, ""),
                },
                shareMediaCategory: 'IMAGE',
                media: [
                    {
                        status: 'READY',
                        description: {
                            text: text.replace(/[*`]/g, ""),
                        },
                        media: imageAsset,
                        title: {
                            text: title.replace(/[*`]/g, ""),
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

module.exports = {
    getLinkedinId,
    registerImageUpload,
    uploadImage,
    createPost
};
