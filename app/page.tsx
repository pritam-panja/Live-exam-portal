"use client";

import React, { useState, useEffect, useCallback } from 'react';

interface Question {
  id: number;
  text: string;
  options: string[];
  correctAnswer: string;
  topic: string;
  marks: number;
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
        apiKey: localStorage.getItem('gemini_key') || '',
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

  // Save config to localStorage
  useEffect(() => {
    if (config.apiKey) localStorage.setItem('gemini_key', config.apiKey);
    localStorage.setItem('timer_minutes', String(config.timerMinutes));
    localStorage.setItem('marks_per_q', String(config.marksPerQuestion));
    localStorage.setItem('negative_marking', String(config.negativeMarking));
    localStorage.setItem('negative_value', String(config.negativeMarksValue));
  }, [config]);

  // Auto-submit when timer hits 0
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

  const processPDF = async () => {
    if (!file) { alert('Please upload a PDF file.'); return; }
    if (!config.apiKey) { alert('Please enter your Google API Key.'); return; }
    if (config.timerMinutes < 1) { alert('Timer must be at least 1 minute.'); return; }

    setAppState('loading');
    setLoadingProgress(10);
    setLoadingText('Reading PDF file...');

    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setLoadingProgress(30);
      setLoadingText('Sending to Gemini AI...');

      const prompt = `You are an expert exam question extractor. Analyze this PDF exam paper carefully.
Extract ALL multiple choice questions with their options and correct answers.
Return ONLY a valid JSON array with NO markdown, NO code blocks, NO extra text.
Format: [{"text": "Full question text here?", "options": ["A) option1", "B) option2", "C) option3", "D) option4"], "correctAnswer": "A) option1", "topic": "Subject/Topic name"}]
Rules:
- correctAnswer must exactly match one of the options
- Include all 4 options for each question
- Extract every question from the paper
- topic should be the subject area of the question`;

      setLoadingProgress(50);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inline_data: { mime_type: 'application/pdf', data: base64Data } }
              ]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 8192,
            }
          })
        }
      );

      setLoadingProgress(75);
      setLoadingText('Processing questions...');

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData?.error?.message || 'API request failed');
      }

      const data = await response.json();

      if (!data.candidates || !data.candidates[0]) {
        throw new Error('No response from AI. Check your API key.');
      }

      const rawText = data.candidates[0].content.parts[0].text;

      // Robust JSON extraction
      let jsonStr = rawText;
      const jsonMatch = rawText.match(/\[[\s\S]*\]/);
      if (jsonMatch) jsonStr = jsonMatch[0];

      // Remove markdown code blocks if present
      jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      const parsed = JSON.parse(jsonStr);

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('No questions found in PDF. Make sure it contains MCQ questions.');
      }

      setLoadingProgress(90);
      setLoadingText(`Found ${parsed.length} questions!`);

      const formattedQuestions: Question[] = parsed.map((q: any, i: number) => ({
        id: i + 1,
        text: q.text || q.question || `Question ${i + 1}`,
        options: Array.isArray(q.options) ? q.options : [],
        correctAnswer: q.correctAnswer || q.correct_answer || q.answer || '',
        topic: q.topic || 'General',
        marks: config.marksPerQuestion,
      }));

      setLoadingProgress(100);

      setTimeout(() => {
        setQuestions(formattedQuestions);
        setAnswers({});
        setCurrentIdx(0);
        setTimeLeft(config.timerMinutes * 60);
        setAppState('exam');
      }, 500);

    } catch (err: any) {
      console.error(err);
      alert(`Error: ${err.message || 'Failed to process PDF. Please try again.'}`);
      setAppState('setup');
      setLoadingProgress(0);
    }
  };

  // ─── SETUP SCREEN ────────────────────────────────────────────────────────────
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
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <div style={{
              width: '60px', height: '60px',
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              borderRadius: '15px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 15px',
              fontSize: '28px'
            }}>📝</div>
            <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 700, color: '#1e293b' }}>
              PYQ Exam Portal
            </h1>
            <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '14px' }}>
              Upload your question paper and start practicing
            </p>
          </div>

          {/* API Key */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>🔑 Google Gemini API Key</label>
            <input
              type="password"
              placeholder="AIza..."
              value={config.apiKey}
              onChange={e => setConfig(c => ({ ...c, apiKey: e.target.value }))}
              style={inputStyle}
            />
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
              border: '2px dashed #cbd5e1',
              borderRadius: '12px',
              cursor: 'pointer',
              background: file ? '#f0fdf4' : '#f8fafc',
              borderColor: file ? '#22c55e' : '#cbd5e1',
              transition: 'all 0.2s',
              gap: '8px'
            }}>
              <span style={{ fontSize: '32px' }}>{file ? '✅' : '📂'}</span>
              <span style={{ fontSize: '14px', color: file ? '#16a34a' : '#64748b', fontWeight: 600 }}>
                {file ? fileName : 'Click to browse PDF file'}
              </span>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                {file ? `Ready to process` : 'PDF format supported'}
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

          {/* Timer + Marks Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
            <div>
              <label style={labelStyle}>⏱ Duration (Minutes)</label>
              <input
                type="number"
                min="1"
                max="300"
                value={config.timerMinutes}
                onChange={e => setConfig(c => ({ ...c, timerMinutes: Number(e.target.value) }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>⭐ Marks Per Question</label>
              <input
                type="number"
                min="1"
                max="10"
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
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#92400e' }}>⚠️ Negative Marking</div>
                <div style={{ fontSize: '12px', color: '#b45309' }}>Deduct marks for wrong answers</div>
              </div>
              <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '26px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={config.negativeMarking}
                  onChange={e => setConfig(c => ({ ...c, negativeMarking: e.target.checked }))}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  background: config.negativeMarking ? '#667eea' : '#cbd5e1',
                  borderRadius: '26px',
                  transition: '0.3s'
                }}>
                  <span style={{
                    position: 'absolute',
                    top: '3px',
                    left: config.negativeMarking ? '25px' : '3px',
                    width: '20px', height: '20px',
                    background: 'white',
                    borderRadius: '50%',
                    transition: '0.3s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }} />
                </span>
              </label>
            </div>
            {config.negativeMarking && (
              <div>
                <label style={{ ...labelStyle, color: '#92400e' }}>Marks deducted per wrong answer</label>
                <input
                  type="number"
                  min="0.25"
                  max="4"
                  step="0.25"
                  value={config.negativeMarksValue}
                  onChange={e => setConfig(c => ({ ...c, negativeMarksValue: Number(e.target.value) }))}
                  style={{ ...inputStyle, borderColor: '#fde68a' }}
                />
              </div>
            )}
          </div>

          {/* Start Button */}
          <button
            onClick={processPDF}
            style={{
              width: '100%',
              padding: '15px',
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.5px',
              boxShadow: '0 8px 20px rgba(102,126,234,0.4)',
              transition: 'transform 0.2s',
            }}
            onMouseOver={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
            onMouseOut={e => (e.currentTarget.style.transform = 'translateY(0)')}
          >
            🚀 Start Exam
          </button>
        </div>
      </div>
    );
  }

  // ─── LOADING SCREEN ───────────────────────────────────────────────────────────
  if (appState === 'loading') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Segoe UI', sans-serif"
      }}>
        <div style={{
          background: 'white',
          padding: '50px 40px',
          borderRadius: '20px',
          textAlign: 'center',
          maxWidth: '400px',
          width: '90%',
          boxShadow: '0 25px 60px rgba(0,0,0,0.3)'
        }}>
          <div style={{ fontSize: '60px', marginBottom: '20px', animation: 'spin 2s linear infinite' }}>⚙️</div>
          <h2 style={{ margin: '0 0 8px', color: '#1e293b', fontSize: '22px' }}>Analyzing PDF</h2>
          <p style={{ color: '#64748b', marginBottom: '25px', fontSize: '14px' }}>{loadingText}</p>
          <div style={{ background: '#f1f5f9', borderRadius: '10px', height: '10px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              background: 'linear-gradient(90deg, #667eea, #764ba2)',
              width: `${loadingProgress}%`,
              borderRadius: '10px',
              transition: 'width 0.5s ease'
            }} />
          </div>
          <p style={{ color: '#94a3b8', marginTop: '12px', fontSize: '13px' }}>{loadingProgress}% complete</p>
        </div>
      </div>
    );
  }

  // ─── RESULTS SCREEN ───────────────────────────────────────────────────────────
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

    // Topic breakdown
    const topicMap: Record<string, { correct: number; total: number }> = {};
    questions.forEach(q => {
      if (!topicMap[q.topic]) topicMap[q.topic] = { correct: 0, total: 0 };
      topicMap[q.topic].total++;
      if (answers[q.id] === q.correctAnswer) topicMap[q.topic].correct++;
    });

    return (
      <div style={{
        minHeight: '100vh',
        background: '#f1f5f9',
        fontFamily: "'Segoe UI', sans-serif",
        padding: '30px 20px'
      }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>

          {/* Header Card */}
          <div style={{
            background: `linear-gradient(135deg, ${color}22, ${color}11)`,
            border: `2px solid ${color}44`,
            borderRadius: '20px',
            padding: '40px',
            textAlign: 'center',
            marginBottom: '25px'
          }}>
            <div style={{ fontSize: '20px', color: '#64748b', marginBottom: '8px' }}>Exam Completed</div>
            <div style={{ fontSize: '80px', fontWeight: 800, color, lineHeight: 1 }}>{grade}</div>
            <div style={{ fontSize: '22px', fontWeight: 600, color: '#1e293b', marginTop: '10px' }}>{label}</div>
            <div style={{ fontSize: '48px', fontWeight: 800, color, marginTop: '15px' }}>
              {finalScore} <span style={{ fontSize: '24px', color: '#64748b' }}>/ {maxScore}</span>
            </div>
            <div style={{
              display: 'inline-block',
              background: color,
              color: 'white',
              padding: '6px 20px',
              borderRadius: '20px',
              fontSize: '18px',
              fontWeight: 700,
              marginTop: '10px'
            }}>{percentage}%</div>
          </div>

          {/* Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '15px', marginBottom: '25px' }}>
            {[
              { label: 'Total Questions', value: totalQuestions, color: '#667eea', icon: '📋' },
              { label: 'Attempted', value: attempted, color: '#2563eb', icon: '✏️' },
              { label: 'Correct', value: correct, color: '#16a34a', icon: '✅' },
              { label: 'Wrong', value: wrong, color: '#dc2626', icon: '❌' },
              { label: 'Unattempted', value: unattempted, color: '#f59e0b', icon: '⭕' },
              { label: 'Deduction', value: `-${deduction}`, color: '#dc2626', icon: '➖' },
            ].map((stat, i) => (
              <div key={i} style={{
                background: 'white',
                borderRadius: '15px',
                padding: '20px',
                textAlign: 'center',
                boxShadow: '0 4px 15px rgba(0,0,0,0.06)',
                borderTop: `4px solid ${stat.color}`
              }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>{stat.icon}</div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, marginTop: '4px' }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Topic Breakdown */}
          {Object.keys(topicMap).length > 1 && (
            <div style={{ background: 'white', borderRadius: '15px', padding: '25px', marginBottom: '25px', boxShadow: '0 4px 15px rgba(0,0,0,0.06)' }}>
              <h3 style={{ margin: '0 0 20px', color: '#1e293b', fontSize: '18px' }}>📊 Topic-wise Performance</h3>
              {Object.entries(topicMap).map(([topic, data], i) => {
                const pct = Math.round((data.correct / data.total) * 100);
                return (
                  <div key={i} style={{ marginBottom: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#374151' }}>{topic}</span>
                      <span style={{ fontSize: '14px', color: '#64748b' }}>{data.correct}/{data.total} ({pct}%)</span>
                    </div>
                    <div style={{ background: '#f1f5f9', borderRadius: '8px', height: '10px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: pct >= 70 ? '#16a34a' : pct >= 40 ? '#f59e0b' : '#dc2626',
                        borderRadius: '8px',
                        transition: 'width 1s ease'
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Question Review */}
          <div style={{ background: 'white', borderRadius: '15px', padding: '25px', marginBottom: '25px', boxShadow: '0 4px 15px rgba(0,0,0,0.06)' }}>
            <h3 style={{ margin: '0 0 20px', color: '#1e293b', fontSize: '18px' }}>🔍 Question Review</h3>
            {questions.map((q, i) => {
              const userAnswer = answers[q.id];
              const isCorrect = userAnswer === q.correctAnswer;
              const isUnattempted = !userAnswer;
              const bgColor = isUnattempted ? '#fffbeb' : isCorrect ? '#f0fdf4' : '#fef2f2';
              const borderColor = isUnattempted ? '#fde68a' : isCorrect ? '#86efac' : '#fca5a5';
              const icon = isUnattempted ? '⭕' : isCorrect ? '✅' : '❌';

              return (
                <div key={q.id} style={{
                  border: `1px solid ${borderColor}`,
                  background: bgColor,
                  borderRadius: '12px',
                  padding: '18px',
                  marginBottom: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{ fontSize: '18px', marginTop: '2px' }}>{icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '10px', fontSize: '14px' }}>
                        Q{i + 1}. {q.text}
                      </div>
                      <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', fontSize: '13px' }}>
                        {!isUnattempted && (
                          <span style={{ color: isCorrect ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                            Your answer: {userAnswer}
                          </span>
                        )}
                        {!isCorrect && (
                          <span style={{ color: '#16a34a', fontWeight: 600 }}>
                            Correct: {q.correctAnswer}
                          </span>
                        )}
                        {isUnattempted && (
                          <span style={{ color: '#d97706', fontWeight: 600 }}>Not attempted</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                setAnswers({});
                setCurrentIdx(0);
                setTimeLeft(config.timerMinutes * 60);
                setAppState('exam');
              }}
              style={{
                padding: '14px 30px',
                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 8px 20px rgba(102,126,234,0.4)'
              }}
            >
              🔄 Retake Exam
            </button>
            <button
              onClick={() => {
                setFile(null);
                setFileName('');
                setQuestions([]);
                setAnswers({});
                setAppState('setup');
              }}
              style={{
                padding: '14px 30px',
                background: 'white',
                color: '#667eea',
                border: '2px solid #667eea',
                borderRadius: '12px',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              📄 New Exam
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── EXAM SCREEN ─────────────────────────────────────────────────────────────
  const currentQuestion = questions[currentIdx];
  const totalQ = questions.length;
  const answeredCount = Object.keys(answers).length;
  const isLastQuestion = currentIdx === totalQ - 1;
  const timerPercent = (timeLeft / (config.timerMinutes * 60)) * 100;
  const isTimerWarning = timeLeft <= 300; // 5 minutes warning
  const isTimerCritical = timeLeft <= 60; // 1 minute critical

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: '#f1f5f9',
      fontFamily: "'Segoe UI', sans-serif",
      flexDirection: 'column'
    }}>
      {/* Top Bar */}
      <div style={{
        background: 'white',
        padding: '12px 25px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{ fontWeight: 700, fontSize: '18px', color: '#1e293b' }}>📝 PYQ Exam Portal</div>

        {/* Timer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: isTimerCritical ? '#fef2f2' : isTimerWarning ? '#fffbeb' : '#f0fdf4',
          padding: '8px 20px',
          borderRadius: '12px',
          border: `2px solid ${isTimerCritical ? '#fca5a5' : isTimerWarning ? '#fde68a' : '#86efac'}`
        }}>
          <span style={{ fontSize: '20px' }}>{isTimerCritical ? '🚨' : isTimerWarning ? '⚠️' : '⏱'}</span>
          <div>
            <div style={{
              fontSize: '22px',
              fontWeight: 800,
              color: isTimerCritical ? '#dc2626' : isTimerWarning ? '#d97706' : '#16a34a',
              fontFamily: 'monospace'
            }}>
              {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}
            </div>
            <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '4px', marginTop: '4px', width: '80px' }}>
              <div style={{
                height: '100%',
                width: `${timerPercent}%`,
                background: isTimerCritical ? '#dc2626' : isTimerWarning ? '#f59e0b' : '#16a34a',
                borderRadius: '4px',
                transition: 'width 1s linear'
              }} />
            </div>
          </div>
        </div>

        {/* Progress + Submit */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ fontSize: '13px', color: '#64748b', textAlign: 'right' }}>
            <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '15px' }}>{answeredCount}/{totalQ} answered</div>
            <div>Q {currentIdx + 1} of {totalQ}</div>
          </div>
          <button
            onClick={submitExam}
            style={{
              padding: '10px 20px',
              background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '14px',
              boxShadow: '0 4px 12px rgba(220,38,38,0.3)'
            }}
          >
            Submit Exam
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ display: 'flex', flex: 1, padding: '20px', gap: '20px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>

        {/* Question Panel */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px' }}>

          {/* Question Card */}
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '30px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.06)',
            flex: 1
          }}>
            {/* Question Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  color: 'white',
                  width: '36px', height: '36px',
                  borderRadius: '10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: '16px'
                }}>
                  {currentIdx + 1}
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Question {currentIdx + 1} of {totalQ}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>Topic: {currentQuestion?.topic}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{ background: '#dbeafe', color: '#2563eb', padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600 }}>
                  +{config.marksPerQuestion} marks
                </span>
                {config.negativeMarking && (
                  <span style={{ background: '#fee2e2', color: '#dc2626', padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600 }}>
                    -{config.negativeMarksValue} negative
                  </span>
                )}
              </div>
            </div>

            {/* Question Text */}
            <p style={{
              fontSize: '17px',
              color: '#1e293b',
              lineHeight: 1.7,
              marginBottom: '25px',
              fontWeight: 500,
              padding: '15px',
              background: '#f8fafc',
              borderRadius: '10px',
              borderLeft: '4px solid #667eea'
            }}>
              {currentQuestion?.text}
            </p>

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {currentQuestion?.options.map((opt: string, i: number) => {
                const isSelected = answers[currentQuestion.id] === opt;
                const letters = ['A', 'B', 'C', 'D'];
                return (
                  <button
                    key={i}
                    onClick={() => setAnswers(prev => ({ ...prev, [currentQuestion.id]: opt }))}
                    style={{
                      padding: '15px 20px',
                      border: `2px solid ${isSelected ? '#667eea' : '#e2e8f0'}`,
                      borderRadius: '12px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      background: isSelected ? 'linear-gradient(135deg, #ede9fe, #dbeafe)' : 'white',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '15px',
                      transition: 'all 0.2s',
                      fontFamily: "'Segoe UI', sans-serif",
                      fontSize: '15px',
                      color: '#1e293b',
                      fontWeight: isSelected ? 600 : 400,
                      boxShadow: isSelected ? '0 4px 12px rgba(102,126,234,0.2)' : 'none'
                    }}
                    onMouseOver={e => {
                      if (!isSelected) e.currentTarget.style.borderColor = '#a5b4fc';
                    }}
                    onMouseOut={e => {
                      if (!isSelected) e.currentTarget.style.borderColor = '#e2e8f0';
                    }}
                  >
                    <span style={{
                      width: '32px', height: '32px',
                      borderRadius: '8px',
                      background: isSelected ? '#667eea' : '#f1f5f9',
                      color: isSelected ? 'white' : '#64748b',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: '14px',
                      flexShrink: 0
                    }}>
                      {letters[i]}
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>

            {/* Clear Selection */}
            {answers[currentQuestion?.id] && (
              <button
                onClick={() => setAnswers(prev => {
                  const copy = { ...prev };
                  delete copy[currentQuestion.id];
                  return copy;
                })}
                style={{
                  marginTop: '15px',
                  padding: '8px 16px',
                  background: 'transparent',
                  color: '#dc2626',
                  border: '1px solid #fca5a5',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600
                }}
              >
                🗑 Clear Selection
              </button>
            )}
          </div>

          {/* Navigation */}
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '15px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 4px 15px rgba(0,0,0,0.06)'
          }}>
            <button
              disabled={currentIdx === 0}
              onClick={() => setCurrentIdx(prev => prev - 1)}
              style={{
                padding: '10px 24px',
                background: currentIdx === 0 ? '#f1f5f9' : 'white',
                color: currentIdx === 0 ? '#94a3b8' : '#667eea',
                border: `2px solid ${currentIdx === 0 ? '#e2e8f0' : '#667eea'}`,
                borderRadius: '10px',
                cursor: currentIdx === 0 ? 'not-allowed' : 'pointer',
                fontWeight: 600, fontSize: '14px'
              }}
            >
              ← Previous
            </button>

            <div style={{ display: 'flex', gap: '8px' }}>
              {answers[currentQuestion?.id] ? (
                <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  ✅ Answered
                </span>
              ) : (
                <span style={{ color: '#94a3b8', fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  ⭕ Not answered
                </span>
              )}
            </div>

            {isLastQuestion ? (
              <button
                onClick={submitExam}
                style={{
                  padding: '10px 24px',
                  background: 'linear-gradient(135deg, #16a34a, #15803d)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '14px',
                  boxShadow: '0 4px 12px rgba(22,163,74,0.3)'
                }}
              >
                Submit Exam ✓
              </button>
            ) : (
              <button
                onClick={() => setCurrentIdx(prev => prev + 1)}
                style={{
                  padding: '10px 24px',
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '14px',
                  boxShadow: '0 4px 12px rgba(102,126,234,0.3)'
                }}
              >
                Next →
              </button>
            )}
          </div>
        </main>

        {/* Sidebar - Question Palette */}
        <aside style={{
          width: '260px',
          display: 'flex',
          flexDirection: 'column',
          gap: '15px',
          flexShrink: 0
        }}>
          {/* Legend */}
          <div style={{ background: 'white', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.06)' }}>
            <h3 style={{ margin: '0 0 15px', fontSize: '15px', color: '#1e293b' }}>Question Palette</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
              {[
                { color: '#16a34a', bg: '#f0fdf4', label: 'Answered', count: answeredCount },
                { color: '#dc2626', bg: '#fef2f2', label: 'Not Answered', count: totalQ - answeredCount },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '16px', height: '16px',
                      borderRadius: '4px',
                      background: item.bg,
                      border: `2px solid ${item.color}`
                    }} />
                    <span style={{ fontSize: '13px', color: '#64748b' }}>{item.label}</span>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: item.color }}>{item.count}</span>
                </div>
              ))}
            </div>

            {/* Question Grid */}
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
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: isCurrent ? 'white' : isAnswered ? 'white' : '#dc2626',
                      transition: 'all 0.15s'
                    }}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Exam Info */}
          <div style={{ background: 'white', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.06)' }}>
            <h3 style={{ margin: '0 0 15px', fontSize: '15px', color: '#1e293b' }}>📋 Exam Info</h3>
            {[
              { label: 'Total Questions', value: totalQ },
              { label: 'Marks/Question', value: `+${config.marksPerQuestion}` },
              { label: 'Negative Marks', value: config.negativeMarking ? `-${config.negativeMarksValue}` : 'None' },
              { label: 'Max Score', value: totalQ * config.marksPerQuestion },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: 'space-between',
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

// Shared styles
const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontWeight: 600,
  fontSize: '13px',
  color: '#374151'
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  border: '2px solid #e2e8f0',
  borderRadius: '10px',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: "'Segoe UI', sans-serif",
  transition: 'border-color 0.2s',
  color: '#1e293b'
};
