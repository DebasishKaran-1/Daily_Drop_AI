'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');

let _client = null;

function _getClient() {
    if (_client) return _client;
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
    _client = new GoogleGenerativeAI(apiKey);
    return _client;
}

// Accepts the system instruction and user content separately so
// callers never need to know how Gemini's API structures messages.
exports.generate = async (systemInstruction, userContent) => {
    const client    = _getClient();
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const model     = client.getGenerativeModel({ model: modelName });

    // Gemini uses a single text prompt — combine both parts
    const prompt   = `${systemInstruction}\n\n${userContent}`;
    const result   = await model.generateContent(prompt);
    const response = await result.response;
    const text     = response.text();

    if (!text?.trim()) throw new Error('Empty response from Gemini');
    return text.trim();
};
