'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const geminiProvider         = require('../providers/geminiProvider');
const groqProvider           = require('../providers/groqProvider');

// ── Kept for server.js startup diagnostics (interface unchanged) ──────────
let _geminiClient = null;
function getGeminiClient() {
    if (_geminiClient) return _geminiClient;
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
        console.error('[Gemini] ✗ GEMINI_API_KEY is missing in environment.');
        return null;
    }
    _geminiClient = new GoogleGenerativeAI(apiKey);
    console.log('[Gemini] ✓ Gemini key detected, client initialized.');
    return _geminiClient;
}

// ── Prompt builder (same content as before, split into two parts) ─────────
function _buildPrompt(article, question) {
    const systemInstruction = [
        'You are DailyDrop AI.',
        '',
        'You may ONLY answer using the article content below.',
        '',
        'Rules:',
        '- Do not use outside knowledge.',
        '- Do not answer unrelated questions.',
        '- If answer is not present in article, respond exactly: "This article does not contain that information."',
        '- Never hallucinate.',
        '- Keep answers concise.',
        '- Markdown is allowed for short bullets or bold labels.'
    ].join('\n');

    const userContent = [
        'ARTICLE:',
        `Title: ${article.title}`,
        `Description: ${article.description}`,
        `Content: ${article.content}`,
        '',
        'QUESTION:',
        question
    ].join('\n');

    return { systemInstruction, userContent };
}

// ── Main export — interface unchanged, controller needs no edits ──────────
async function generateArticleAnswer(article, question) {
    const { systemInstruction, userContent } = _buildPrompt(article, question);

    // ── Level 1: Gemini ──────────────────────────────────────────────────
    try {
        const text = await geminiProvider.generate(systemInstruction, userContent);
        console.log('[AI] Provider = Gemini');
        return text;
    } catch (geminiErr) {
        console.warn(
            `[AI] Gemini unavailable → switching to Groq  (${geminiErr.message?.slice(0, 120)})`
        );
    }

    // ── Level 2: Groq fallback ───────────────────────────────────────────
    try {
        const text = await groqProvider.generate(systemInstruction, userContent);
        console.log('[AI] Gemini unavailable → switched to Groq');
        return text;
    } catch (groqErr) {
        console.error(`[AI] Both providers failed  (Groq: ${groqErr.message?.slice(0, 120)})`);
    }

    // ── Both failed — throw with user-safe message ───────────────────────
    console.error('[AI] Both providers failed');
    const err       = new Error('AI service is temporarily unavailable. Please try again shortly.');
    err.userMessage = err.message;
    throw err;
}

module.exports = { getGeminiClient, generateArticleAnswer };
