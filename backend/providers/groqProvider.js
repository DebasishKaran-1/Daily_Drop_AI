'use strict';

const Groq = require('groq-sdk');

let _client = null;

function _getClient() {
    if (_client) return _client;
    const apiKey = (process.env.GROQ_API_KEY || '').trim();
    if (!apiKey) throw new Error('GROQ_API_KEY not configured');
    _client = new Groq({ apiKey });
    return _client;
}

// Accepts the system instruction and user content separately so the
// chat-completions format (system / user roles) is used correctly.
exports.generate = async (systemInstruction, userContent) => {
    const client = _getClient();
    const model  = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

    const completion = await client.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user',   content: userContent },
        ],
        temperature: 0.3,
        max_tokens:  1024,
    });

    const text = completion.choices?.[0]?.message?.content;
    if (!text?.trim()) throw new Error('Empty response from Groq');
    return text.trim();
};
