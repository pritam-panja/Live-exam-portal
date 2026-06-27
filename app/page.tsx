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

  // ─── RESULTS SCREEN ────────────────────────────────────────────────────────
  if (appState === 'results') {
    const totalQuestions = questions.length;
    const attempted = Object.keys(answers).length;
    const unattempted = totalQuestions - attempted;
    const correct = questions.filter(q => answers[q.id] === q.correctAnswer).length;
    const wrong = attempted - correct;
    const rawMarks = correct * config.marksPerQuestion;
    const deduction = config.negativeMarking ? wrong * config.negativeMarksValue : 0;
    const finalScore = Math.max(0, rawMarks - deduction);
    const maxScore = totalQuestions * config.marksPerQuestion;
    const percentage = maxScore > 0 ? Math.round((finalScore / maxScore) * 100) : 0;

    const getGrade = () => {
      if (percentage >= 90) return { grade: 'A+', color: '#16a34a', label: 'Outstanding! 🏆' };
      if (percentage >= 75) return { grade: 'A', color: '#2563eb', label: 'Excellent! 🎉' };
      if (percentage >= 60) return { grade: 'B', color: '#7c3aed', label: 'Good Job! 👍' };
      if (percentage >= 45) return { grade: 'C', color: '#d97706', label: 'Average 📚' };
      return { grade: 'D', color: '#dc2626', label: 'Needs Improvement 💪' };
    };

    const { grade, color, label } = getGrade();

    const topicMap: Record<string, { correct: number; total: number }> = {};
    questions.forEach(q => {
      if (!topicMap[q.topic]) topicMap[q.topic] = { correct: 0, total: 0 };
      topicMap[q.topic].total++;
      if (answers[q.id] === q.correctAnswer) topicMap[q.topic].correct++;
    });

    return (
      <div style={{
        minHeight: '100vh', background: '#f1f5f9',
        fontFamily: "'Segoe UI', sans-serif", padding: '30px 20px'
      }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>

          {/* Score Card */}
          <div style={{
            background: `linear-gradient(135deg, ${color}18, ${color}08)`,
            border: `2px solid ${color}33`,
            borderRadius: '24px', padding: '40px',
            textAlign: 'center', marginBottom: '25px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.08)'
          }}>
            <div style={{ fontSize: '16px', color: '#64748b', marginBottom: '5px', fontWeight: 500 }}>
              Exam Completed ✓
            </div>
            <div style={{ fontSize: '90px', fontWeight: 900, color, lineHeight: 1, marginBottom: '5px' }}>
              {grade}
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b' }}>{label}</div>
            <div style={{ fontSize: '52px', fontWeight: 900, color, margin: '15px 0 5px' }}>
              {finalScore}
              <span style={{ fontSize: '24px', color: '#94a3b8', fontWeight: 500 }}> / {maxScore}</span>
            </div>
            <div style={{
              display: 'inline-block', background: color,
              color: 'white', padding: '8px 24px',
              borderRadius: '25px', fontSize: '20px', fontWeight: 800
            }}>{percentage}%</div>

            {config.negativeMarking && deduction > 0 && (
              <div style={{ marginTop: '15px', fontSize: '13px', color: '#dc2626' }}>
                ⚠️ {correct * config.marksPerQuestion} marks - {deduction} deducted = {finalScore} final score
              </div>
            )}
          </div>

          {/* Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '25px' }}>
            {[
              { label: 'Total Qs', value: totalQuestions, color: '#667eea', icon: '📋' },
              { label: 'Attempted', value: attempted, color: '#2563eb', icon: '✏️' },
              { label: 'Correct', value: correct, color: '#16a34a', icon: '✅' },
              { label: 'Wrong', value: wrong, color: '#dc2626', icon: '❌' },
              { label: 'Skipped', value: unattempted, color: '#f59e0b', icon: '⭕' },
              { label: 'Deduction', value: `-${deduction}`, color: '#dc2626', icon: '➖' },
            ].map((stat, i) => (
              <div key={i} style={{
                background: 'white', borderRadius: '16px',
                padding: '20px 15px', textAlign: 'center',
                boxShadow: '0 4px 15px rgba(0,0,0,0.06)',
                borderTop: `4px solid ${stat.color}`
              }}>
                <div style={{ fontSize: '26px', marginBottom: '6px' }}>{stat.icon}</div>
                <div style={{ fontSize: '26px', fontWeight: 800, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginTop: '3px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Topic Breakdown */}
          {Object.keys(topicMap).length > 1 && (
            <div style={{ background: 'white', borderRadius: '16px', padding: '25px', marginBottom: '25px', boxShadow: '0 4px 15px rgba(0,0,0,0.06)' }}>
              <h3 style={{ margin: '0 0 20px', color: '#1e293b', fontSize: '17px', fontWeight: 700 }}>
                📊 Topic-wise Performance
              </h3>
              {Object.entries(topicMap).map(([topic, data], i) => {
                const pct = Math.round((data.correct / data.total) * 100);
                const barColor = pct >= 70 ? '#16a34a' : pct >= 40 ? '#f59e0b' : '#dc2626';
                return (
                  <div key={i} style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#374151' }}>{topic}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', color: '#64748b' }}>{data.correct}/{data.total}</span>
                        <span style={{
                          background: barColor + '20', color: barColor,
                          padding: '2px 8px', borderRadius: '8px',
                          fontSize: '12px', fontWeight: 700
                        }}>{pct}%</span>
                      </div>
                    </div>
                    <div style={{ background: '#f1f5f9', borderRadius: '8px', height: '10px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${pct}%`,
                        background: barColor, borderRadius: '8px',
                        transition: 'width 1s ease'
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Question Review */}
          <div style={{ background: 'white', borderRadius: '16px', padding: '25px', marginBottom: '25px', boxShadow: '0 4px 15px rgba(0,0,0,0.06)' }}>
            <h3 style={{ margin: '0 0 20px', color: '#1e293b', fontSize: '17px', fontWeight: 700 }}>
              🔍 Detailed Question Review
            </h3>
            {questions.map((q, i) => {
              const userAnswer = answers[q.id];
              const isCorrect = userAnswer === q.correctAnswer;
              const isUnattempted = !userAnswer;
              const bgColor = isUnattempted ? '#fffbeb' : isCorrect ? '#f0fdf4' : '#fef2f2';
              const borderColor = isUnattempted ? '#fde68a' : isCorrect ? '#86efac' : '#fca5a5';
              const icon = isUnattempted ? '⭕' : isCorrect ? '✅' : '❌';

              return (
                <div key={q.id} style={{
                  border: `1.5px solid ${borderColor}`,
                  background: bgColor, borderRadius: '12px',
                  padding: '16px', marginBottom: '12px'
                }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <span style={{ fontSize: '18px', flexShrink: 0, marginTop: '2px' }}>{icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '8px', fontSize: '14px', lineHeight: 1.5 }}>
                        Q{i + 1}. {q.text}
                      </div>
                      <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', fontSize: '13px', marginBottom: q.explanation ? '10px' : 0 }}>
                        {!isUnattempted && (
                          <span style={{ color: isCorrect ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                            Your answer: {userAnswer}
                          </span>
                        )}
                        {!isCorrect && (
                          <span style={{ color: '#16a34a', fontWeight: 700 }}>
                            ✓ Correct: {q.correctAnswer}
                          </span>
                        )}
                        {isUnattempted && (
                          <span style={{ color: '#d97706', fontWeight: 600 }}>Not attempted</span>
                        )}
                      </div>
                      {q.explanation && (
                        <div style={{
                          background: 'rgba(255,255,255,0.8)',
                          borderLeft: '3px solid #667eea',
                          padding: '10px 12px', borderRadius: '0 8px 8px 0',
                          fontSize: '13px', color: '#475569', marginTop: '8px', lineHeight: 1.6
                        }}>
                          <strong style={{ color: '#667eea' }}>💡 Explanation: </strong>
                          {q.explanation}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', flexWrap: 'wrap', paddingBottom: '20px' }}>
            <button
              onClick={() => {
                setAnswers({});
                setCurrentIdx(0);
                setTimeLeft(config.timerMinutes * 60);
                setAppState('exam');
              }}
              style={{
                padding: '14px 32px',
                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                color: 'white', border: 'none', borderRadius: '12px',
                fontSize: '15px', fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 8px 20px rgba(102,126,234,0.35)'
              }}
            >🔄 Retake Exam</button>
            <button
              onClick={() => {
                setFile(null); setFileName('');
                setQuestions([]); setAnswers({});
                setAppState('setup');
              }}
              style={{
                padding: '14px 32px', background: 'white',
                color: '#667eea', border: '2px solid #667eea',
                borderRadius: '12px', fontSize: '15px', fontWeight: 700, cursor: 'pointer'
              }}
            >📄 New Exam</button>
          </div>
        </div>
      </div>
    );
  }

  // ─── EXAM SCREEN ───────────────────────────────────────────────────────────
  const currentQuestion = questions[currentIdx];
  const totalQ = questions.length;
  const answeredCount = Object.keys(answers).length;
  const isLastQuestion = currentIdx === totalQ - 1;
  const timerPercent = (timeLeft / (config.timerMinutes * 60)) * 100;
  const isTimerWarning = timeLeft <= 300;
  const isTimerCritical = timeLeft <= 60;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f1f5f9', fontFamily: "'Segoe UI', sans-serif", flexDirection: 'column' }}>

      {/* Top Bar */}
      <div style={{
        background: 'white', padding: '12px 25px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 2px 15px rgba(0,0,0,0.08)',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ fontWeight: 800, fontSize: '18px', color: '#1e293b' }}>📝 PYQ Exam Portal</div>

        {/* Timer */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          background: isTimerCritical ? '#fef2f2' : isTimerWarning ? '#fffbeb' : '#f0fdf4',
          padding: '8px 20px', borderRadius: '12px',
          border: `2px solid ${isTimerCritical ? '#fca5a5' : isTimerWarning ? '#fde68a' : '#86efac'}`
        }}>
          <span style={{ fontSize: '20px' }}>{isTimerCritical ? '🚨' : isTimerWarning ? '⚠️' : '⏱'}</span>
          <div>
            <div style={{
              fontSize: '24px', fontWeight: 900,
              color: isTimerCritical ? '#dc2626' : isTimerWarning ? '#d97706' : '#16a34a',
              fontFamily: 'monospace', letterSpacing: '2px'
            }}>
              {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}
            </div>
            <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '4px', marginTop: '3px' }}>
              <div style={{
                height: '100%', width: `${timerPercent}%`,
                background: isTimerCritical ? '#dc2626' : isTimerWarning ? '#f59e0b' : '#16a34a',
                borderRadius: '4px', transition: 'width 1s linear'
              }} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '15px' }}>{answeredCount}/{totalQ} answered</div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>Q {currentIdx + 1} of {totalQ}</div>
          </div>
          <button
            onClick={submitExam}
            style={{
              padding: '10px 20px',
              background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
              color: 'white', border: 'none', borderRadius: '10px',
              fontWeight: 700, cursor: 'pointer', fontSize: '14px',
              boxShadow: '0 4px 12px rgba(220,38,38,0.3)'
            }}
          >Submit Exam</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ display: 'flex', flex: 1, padding: '20px', gap: '20px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>

        {/* Question Panel */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '30px', boxShadow: '0 4px 15px rgba(0,0,0,0.06)', flex: 1 }}>

            {/* Question Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  color: 'white', width: '40px', height: '40px',
                  borderRadius: '12px', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontWeight: 800, fontSize: '16px'
                }}>{currentIdx + 1}</div>
                <div>
                  <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Question {currentIdx + 1} of {totalQ}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>📌 {currentQuestion?.topic}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{ background: '#dbeafe', color: '#2563eb', padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700 }}>
                  +{config.marksPerQuestion} marks
                </span>
                {config.negativeMarking && (
                  <span style={{ background: '#fee2e2', color: '#dc2626', padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700 }}>
                    -{config.negativeMarksValue} wrong
                  </span>
                )}
              </div>
            </div>

            {/* Question Text */}
            <div style={{
              fontSize: '17px', color: '#1e293b', lineHeight: 1.75,
              marginBottom: '25px', fontWeight: 500,
              padding: '18px', background: '#f8fafc',
              borderRadius: '12px', borderLeft: '4px solid #667eea'
            }}>
              {currentQuestion?.text}
            </div>

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {currentQuestion?.options.map((opt: string, i: number) => {
                const isSelected = answers[currentQuestion.id] === opt;
                const letters = ['A', 'B', 'C', 'D', 'E'];
                return (
                  <button
                    key={i}
                    onClick={() => setAnswers(prev => ({ ...prev, [currentQuestion.id]: opt }))}
                    style={{
                      padding: '15px 20px',
                      border: `2px solid ${isSelected ? '#667eea' : '#e2e8f0'}`,
                      borderRadius: '12px', textAlign: 'left', cursor: 'pointer',
                      background: isSelected ? 'linear-gradient(135deg, #ede9fe, #dbeafe)' : 'white',
                      display: 'flex', alignItems: 'center', gap: '15px',
                      fontFamily: "'Segoe UI', sans-serif",
                      fontSize: '15px', color: '#1e293b',
                      fontWeight: isSelected ? 700 : 400,
                      boxShadow: isSelected ? '0 4px 15px rgba(102,126,234,0.2)' : 'none',
                      transition: 'all 0.15s'
                    }}
                  >
                    <span style={{
                      width: '34px', height: '34px', borderRadius: '10px', flexShrink: 0,
                      background: isSelected ? '#667eea' : '#f1f5f9',
                      color: isSelected ? 'white' : '#64748b',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: '14px'
                    }}>{letters[i]}</span>
                    {opt}
                  </button>
                );
              })}
            </div>

            {answers[currentQuestion?.id] && (
              <button
                onClick={() => setAnswers(prev => { const c = { ...prev }; delete c[currentQuestion.id]; return c; })}
                style={{
                  marginTop: '15px', padding: '8px 16px',
                  background: 'transparent', color: '#dc2626',
                  border: '1.5px solid #fca5a5', borderRadius: '8px',
                  cursor: 'pointer', fontSize: '13px', fontWeight: 600
                }}
              >🗑 Clear Selection</button>
            )}
          </div>

          {/* Navigation */}
          <div style={{
            background: 'white', borderRadius: '16px', padding: '15px 20px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            boxShadow: '0 4px 15px rgba(0,0,0,0.06)'
          }}>
            <button
              disabled={currentIdx === 0}
              onClick={() => setCurrentIdx(p => p - 1)}
              style={{
                padding: '10px 24px',
                background: currentIdx === 0 ? '#f1f5f9' : 'white',
                color: currentIdx === 0 ? '#94a3b8' : '#667eea',
                border: `2px solid ${currentIdx === 0 ? '#e2e8f0' : '#667eea'}`,
                borderRadius: '10px', cursor: currentIdx === 0 ? 'not-allowed' : 'pointer',
                fontWeight: 700, fontSize: '14px'
              }}
            >← Previous</button>

            <span style={{
              color: answers[currentQuestion?.id] ? '#16a34a' : '#94a3b8',
              fontWeight: 600, fontSize: '14px'
            }}>
              {answers[currentQuestion?.id] ? '✅ Answered' : '⭕ Not answered'}
            </span>

            {isLastQuestion ? (
              <button
                onClick={submitExam}
                style={{
                  padding: '10px 24px',
                  background: 'linear-gradient(135deg, #16a34a, #15803d)',
                  color: 'white', border: 'none', borderRadius: '10px',
                  cursor: 'pointer', fontWeight: 700, fontSize: '14px',
                  boxShadow: '0 4px 12px rgba(22,163,74,0.3)'
                }}
              >Submit Exam ✓</button>
            ) : (
              <button
                onClick={() => setCurrentIdx(p => p + 1)}
                style={{
                  padding: '10px 24px',
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  color: 'white', border: 'none', borderRadius: '10px',
                  cursor: 'pointer', fontWeight: 700, fontSize: '14px',
                  boxShadow: '0 4px 12px rgba(102,126,234,0.3)'
                }}
              >Next →</button>
            )}
          </div>
        </main>

        {/* Sidebar */}
        <aside style={{ width: '260px', display: 'flex', flexDirection: 'column', gap: '15px', flexShrink: 0 }}>

          {/* Palette */}
          <div style={{ background: 'white', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.06)' }}>
            <h3 style={{ margin: '0 0 15px', fontSize: '15px', color: '#1e293b', fontWeight: 700 }}>Question Palette</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
              {[
                { color: '#16a34a', bg: '#f0fdf4', label: 'Answered', count: answeredCount },
                { color: '#dc2626', bg: '#fef2f2', label: 'Not Answered', count: totalQ - answeredCount },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '14px', height: '14px', borderRadius: '4px', background: item.bg, border: `2px solid ${item.color}` }} />
                    <span style={{ fontSize: '13px', color: '#64748b' }}>{item.label}</span>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: item.color }}>{item.count}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
              {questions.map((q, i) => {
                const isAnswered = !!answers[q.id];
                const isCurrent = i === currentIdx;
                return (
                  <button
                    key={i}
                    onClick={() => setCurrentIdx(i)}
                    style={{
                      height: '36px',
                      background: isCurrent ? '#667eea' : isAnswered ? '#16a34a' : '#fef2f2',
                      border: `2px solid ${isCurrent ? '#4f46e5' : isAnswered ? '#16a34a' : '#fca5a5'}`,
                      borderRadius: '8px', cursor: 'pointer',
                      fontSize: '12px', fontWeight: 800,
                      color: isCurrent || isAnswered ? 'white' : '#dc2626',
                      transition: 'all 0.15s'
                    }}
                  >{i + 1}</button>
                );
              })}
            </div>
          </div>

          {/* Exam Info */}
          <div style={{ background: 'white', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.06)' }}>
            <h3 style={{ margin: '0 0 15px', fontSize: '15px', color: '#1e293b', fontWeight: 700 }}>📋 Exam Info</h3>
            {[
              { label: 'Total Questions', value: totalQ },
              { label: 'Marks/Question', value: `+${config.marksPerQuestion}` },
              { label: 'Negative Marks', value: config.negativeMarking ? `-${config.negativeMarksValue}` : 'None' },
              { label: 'Max Score', value: totalQ * config.marksPerQuestion },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: i < 3 ? '1px solid #f1f5f9' : 'none'
              }}>
                <span style={{ fontSize: '13px', color: '#64748b' }}>{item.label}</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{item.value}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: '6px',
  fontWeight: 700, fontSize: '13px', color: '#374151'
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px',
  border: '2px solid #e2e8f0', borderRadius: '10px',
  fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  fontFamily: "'Segoe UI', sans-serif", color: '#1e293b',
  transition: 'border-color 0.2s'
};
