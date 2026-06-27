"use client";

import React, { useState, useEffect, useCallback } from 'react';

interface Question {
  id: number;
  text: string;
  options: string[];
  correctAnswer: string;
  topic: string;
  marks: number;
  explanation?: string;
}

interface ExamConfig {
  apiKey: string;
  timerMinutes: number;
  marksPerQuestion: number;
  negativeMarking: boolean;
  negativeMarksValue: number;
}

type AppState = 'setup' | 'loading' | 'exam' | 'results';

export default function ExamPlatform() {
  const [appState, setAppState] = useState<AppState>('setup');
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('Reading PDF...');

  const [config, setConfig] = useState<ExamConfig>(() => {
    if (typeof window !== 'undefined') {
      return {
        apiKey: localStorage.getItem('openrouter_key') || '',
        timerMinutes: Number(localStorage.getItem('timer_minutes')) || 30,
        marksPerQuestion: Number(localStorage.getItem('marks_per_q')) || 4,
        negativeMarking: localStorage.getItem('negative_marking') === 'true',
        negativeMarksValue: Number(localStorage.getItem('negative_value')) || 1,
      };
    }
    return {
      apiKey: '',
      timerMinutes: 30,
      marksPerQuestion: 4,
      negativeMarking: false,
      negativeMarksValue: 1,
    };
  });

  useEffect(() => {
    if (config.apiKey) localStorage.setItem('openrouter_key', config.apiKey);
    localStorage.setItem('timer_minutes', String(config.timerMinutes));
    localStorage.setItem('marks_per_q', String(config.marksPerQuestion));
    localStorage.setItem('negative_marking', String(config.negativeMarking));
    localStorage.setItem('negative_value', String(config.negativeMarksValue));
  }, [config]);

  const submitExam = useCallback(() => {
    setAppState('results');
  }, []);

  useEffect(() => {
    if (appState !== 'exam') return;
    if (timeLeft <= 0) {
      submitExam();
      return;
    }
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          submitExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [appState, timeLeft, submitExam]);

  const extractPdfText = async (file: File): Promise<string> => {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += `\n--- Page ${i} ---\n${pageText}\n`;
      setLoadingProgress(20 + (i / pdf.numPages) * 30);
    }
    return fullText;
  };

  const tryWithModel = async (model: string, prompt: string, apiKey: string) => {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://live-exam-portal-two.vercel.app',
        'X-Title': 'PYQ Exam Portal',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 8000,
      })
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err?.error?.message || `Model ${model} failed`);
    }
    return response.json();
  };

  const processPDF = async () => {
    if (!file) { alert('Please upload a PDF file.'); return; }
    if (!config.apiKey) { alert('Please enter your OpenRouter API Key.\n\nGet free key at: openrouter.ai/keys'); return; }
    if (config.timerMinutes < 1) { alert('Timer must be at least 1 minute.'); return; }

    setAppState('loading');
    setLoadingProgress(10);
    setLoadingText('Reading PDF file...');

    try {
      const pdfText = await extractPdfText(file);

      if (!pdfText || pdfText.trim().length < 50) {
        throw new Error('Could not extract text from PDF. Make sure it is a text-based PDF, not a scanned image.');
      }

      setLoadingProgress(55);
      setLoadingText('Sending to AI for analysis...');

      const prompt = `You are an expert exam question extractor for competitive exams like SSC, UPSC, NEET, JEE, GATE etc.

Analyze this exam paper text carefully and extract ALL multiple choice questions.

The text may contain:
- Questions numbered as Q1, Q2, 1., 2., Question 1: etc
- Options labeled as (A)(B)(C)(D) or A) B) C) D) or 1.2.3.4.
- Correct answers may be shown in brackets, marked as "Ans:", highlighted, or in a separate answer key section
- Explanations after each question

YOUR TASK:
1. Extract every single MCQ question
2. Find the correct answer for each question
3. Include explanations if present

Return ONLY a valid JSON array. No markdown. No code blocks. No explanation. Just the JSON:
[
  {
    "text": "Complete question text here?",
    "options": ["(A) First option", "(B) Second option", "(C) Third option", "(D) Fourth option"],
    "correctAnswer": "(C) Third option",
    "topic": "Reasoning/Math/English/GK/Science",
    "explanation": "Brief explanation of why this answer is correct"
  }
]

CRITICAL RULES:
- correctAnswer MUST be copied EXACTLY from one of the options - character for character
- Always include (A) (B) (C) (D) prefix in options
- Extract ALL questions - do not skip any
- If answer key says "Ans: 2" → that means option B (1=A, 2=B, 3=C, 4=D)
- If explanation exists in PDF, include it. Otherwise write a brief one.
- topic must be the subject area

PDF TEXT TO ANALYZE:
${pdfText.substring(0, 12000)}`;

      // Try multiple free models as fallback
      const models = [
        'meta-llama/llama-3.3-70b-instruct:free',
        'deepseek/deepseek-chat:free',
        'mistralai/mistral-7b-instruct:free',
        'google/gemma-3-27b-it:free',
      ];

      let data = null;
      let lastError = '';

      for (const model of models) {
        try {
          setLoadingText(`Trying AI model: ${model.split('/')[1].split(':')[0]}...`);
          data = await tryWithModel(model, prompt, config.apiKey);
          if (data?.choices?.[0]) break;
        } catch (err: any) {
          lastError = err.message;
          console.warn(`Model ${model} failed:`, err.message);
          continue;
        }
      }

      if (!data?.choices?.[0]) {
        throw new Error(`All models failed. Last error: ${lastError}`);
      }

      setLoadingProgress(85);
      setLoadingText('Processing questions...');

      const rawText = data.choices[0].message.content;

      let jsonStr = rawText;
      const jsonMatch = rawText.match(/\[[\s\S]*\]/);
      if (jsonMatch) jsonStr = jsonMatch[0];
      jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        throw new Error('AI returned invalid format. Please try again.');
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('No questions found in PDF. Make sure the PDF contains MCQ questions with options.');
      }

      setLoadingProgress(95);
      setLoadingText(`🎉 Found ${parsed.length} questions!`);

      const formattedQuestions: Question[] = parsed.map((q: any, i: number) => ({
        id: i + 1,
        text: q.text || q.question || `Question ${i + 1}`,
        options: Array.isArray(q.options) ? q.options : [],
        correctAnswer: q.correctAnswer || q.correct_answer || q.answer || '',
        topic: q.topic || 'General',
        marks: config.marksPerQuestion,
        explanation: q.explanation || '',
      }));

      setLoadingProgress(100);

      setTimeout(() => {
        setQuestions(formattedQuestions);
        setAnswers({});
        setCurrentIdx(0);
        setTimeLeft(config.timerMinutes * 60);
        setAppState('exam');
      }, 800);

    } catch (err: any) {
      console.error(err);
      alert(`❌ Error: ${err.message || 'Failed to process PDF. Please try again.'}`);
      setAppState('setup');
      setLoadingProgress(0);
    }
  };

  // ─── SETUP SCREEN ─────────────────────────────────────────────────────────
  if (appState === 'setup') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: "'Segoe UI', sans-serif"
      }}>
        <div style={{
          background: 'white',
          padding: '40px',
          borderRadius: '20px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
          width: '100%',
          maxWidth: '480px'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <div style={{
              width: '65px', height: '65px',
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              borderRadius: '18px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 15px',
              fontSize: '30px',
              boxShadow: '0 8px 20px rgba(102,126,234,0.4)'
            }}>📝</div>
            <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800, color: '#1e293b' }}>
              PYQ Exam Portal
            </h1>
            <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '14px' }}>
              Upload your question paper and start practicing
            </p>
          </div>

          {/* API Key */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>🔑 OpenRouter API Key</label>
            <input
              type="password"
              placeholder="sk-or-v1-..."
              value={config.apiKey}
              onChange={e => setConfig(c => ({ ...c, apiKey: e.target.value }))}
              style={inputStyle}
            />
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '5px' }}>
              Free key at →{' '}
              <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer"
                style={{ color: '#667eea', fontWeight: 600 }}>openrouter.ai/keys</a>
            </div>
          </div>

          {/* PDF Upload */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>📄 Upload Question Paper (PDF)</label>
            <label style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '25px',
              border: `2px dashed ${file ? '#22c55e' : '#cbd5e1'}`,
              borderRadius: '12px',
              cursor: 'pointer',
              background: file ? '#f0fdf4' : '#f8fafc',
              gap: '8px',
              transition: 'all 0.2s'
            }}>
              <span style={{ fontSize: '32px' }}>{file ? '✅' : '📂'}</span>
              <span style={{ fontSize: '14px', color: file ? '#16a34a' : '#64748b', fontWeight: 600 }}>
                {file ? fileName : 'Click to browse PDF file'}
              </span>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                {file ? 'Ready to process!' : 'Supports SSC, UPSC, JEE, NEET, GATE papers'}
              </span>
              <input
                type="file"
                accept="application/pdf"
                style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0] || null;
                  setFile(f);
                  setFileName(f?.name || '');
                }}
              />
            </label>
          </div>

          {/* Timer + Marks */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
            <div>
              <label style={labelStyle}>⏱ Duration (Minutes)</label>
              <input
                type="number" min="1" max="300"
                value={config.timerMinutes}
                onChange={e => setConfig(c => ({ ...c, timerMinutes: Number(e.target.value) }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>⭐ Marks Per Question</label>
              <input
                type="number" min="1" max="10"
                value={config.marksPerQuestion}
                onChange={e => setConfig(c => ({ ...c, marksPerQuestion: Number(e.target.value) }))}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Negative Marking */}
          <div style={{
            background: '#fef9f0',
            border: '1px solid #fde68a',
            borderRadius: '12px',
            padding: '15px',
            marginBottom: '25px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: config.negativeMarking ? '12px' : 0 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#92400e' }}>⚠️ Negative Marking</div>
                <div style={{ fontSize: '12px', color: '#b45309', marginTop: '2px' }}>Deduct marks for wrong answers</div>
              </div>
              <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '26px', cursor: 'pointer', flexShrink: 0 }}>
                <input
                  type="checkbox"
                  checked={config.negativeMarking}
                  onChange={e => setConfig(c => ({ ...c, negativeMarking: e.target.checked }))}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  background: config.negativeMarking ? '#667eea' : '#cbd5e1',
                  borderRadius: '26px', transition: '0.3s'
                }}>
                  <span style={{
                    position: 'absolute', top: '3px',
                    left: config.negativeMarking ? '25px' : '3px',
                    width: '20px', height: '20px',
                    background: 'white', borderRadius: '50%',
                    transition: '0.3s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }} />
                </span>
              </label>
            </div>
            {config.negativeMarking && (
              <div>
                <label style={{ ...labelStyle, color: '#92400e' }}>Marks deducted per wrong answer</label>
                <input
                  type="number" min="0.25" max="4" step="0.25"
                  value={config.negativeMarksValue}
                  onChange={e => setConfig(c => ({ ...c, negativeMarksValue: Number(e.target.value) }))}
                  style={{ ...inputStyle, borderColor: '#fde68a' }}
                />
              </div>
            )}
          </div>

          <button
            onClick={processPDF}
            style={{
              width: '100%', padding: '15px',
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              color: 'white', border: 'none', borderRadius: '12px',
              fontSize: '16px', fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 8px 20px rgba(102,126,234,0.4)',
              letterSpacing: '0.5px'
            }}
          >
            🚀 Start Exam
          </button>
        </div>
      </div>
    );
  }

  // ─── LOADING SCREEN ────────────────────────────────────────────────────────
  if (appState === 'loading') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Segoe UI', sans-serif"
      }}>
        <div style={{
          background: 'white', padding: '50px 40px',
          borderRadius: '20px', textAlign: 'center',
          maxWidth: '420px', width: '90%',
          boxShadow: '0 25px 60px rgba(0,0,0,0.3)'
        }}>
          <div style={{ fontSize: '64px', marginBottom: '20px', lineHeight: 1 }}>
            {loadingProgress < 50 ? '📄' : loadingProgress < 85 ? '🤖' : '✅'}
          </div>
          <h2 style={{ margin: '0 0 8px', color: '#1e293b', fontSize: '22px', fontWeight: 700 }}>
            {loadingProgress < 50 ? 'Reading PDF' : loadingProgress < 85 ? 'AI Analyzing' : 'Almost Done!'}
          </h2>
          <p style={{ color: '#64748b', marginBottom: '30px', fontSize: '14px', minHeight: '20px' }}>
            {loadingText}
          </p>
          <div style={{ background: '#f1f5f9', borderRadius: '10px', height: '12px', overflow: 'hidden', marginBottom: '10px' }}>
            <div style={{
              height: '100%',
              background: 'linear-gradient(90deg, #667eea, #764ba2)',
              width: `${loadingProgress}%`,
              borderRadius: '10px',
              transition: 'width 0.5s ease'
            }} />
          </div>
          <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>{loadingProgress}% complete</p>
          <p style={{ color: '#cbd5e1', fontSize: '11px', marginTop: '20px' }}>
            This may take 20-40 seconds depending on PDF size
          </p>
        </div>
      </div>
    );
  }

  // ─── RESULTS SCREEN 
        
      
