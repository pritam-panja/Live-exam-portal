"use client";

import React, { useState, useEffect } from 'react';

export default function ExamPlatform() {
  const [appState, setAppState] = useState<'setup' | 'loading' | 'exam' | 'results'>('setup');
  const [file, setFile] = useState<File | null>(null);
  const [apiKey, setApiKey] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('gemini_key') || "" : ""));
  const [timerMinutes, setTimerMinutes] = useState(30);
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (apiKey) localStorage.setItem('gemini_key', apiKey);
  }, [apiKey]);

  const processPDF = async () => {
    if (!file || !apiKey) { alert("Upload PDF and add API Key"); return; }
    setAppState('loading');
    try {
      const base64Data = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Extract questions. Return ONLY valid JSON array: [{"text": "Question?", "options": ["A", "B", "C", "D"], "correctAnswer": "A", "topic": "General"}]` }, { inline_data: { mime_type: "application/pdf", data: base64Data } }] }]
        })
      });

      const data = await response.json();
      const text = data.candidates[0].content.parts[0].text;
      const parsed = JSON.parse(text.match(/\[.*\]/s)[0]);
      
      setQuestions(parsed.map((q: any, i: number) => ({ ...q, id: i + 1 })));
      setTimeLeft(timerMinutes * 60);
      setAppState('exam');
    } catch {
      alert("Error reading PDF.");
      setAppState('setup');
    }
  };

  useEffect(() => {
    if (appState !== 'exam' || timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft(t => t - 1), 1000);
    if (timeLeft === 1) setAppState('results');
    return () => clearInterval(timer);
  }, [timeLeft, appState]);

  if (appState === 'loading') return <div style={{height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold'}}>Processing with AI...</div>;

  if (appState === 'setup') return (
    <div style={{minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'}}>
      <div style={{background: 'white', padding: '30px', borderRadius: '15px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px'}}>
        <h1 style={{marginBottom: '20px', textAlign: 'center', fontSize: '22px'}}>Exam Config</h1>
        <input type="password" placeholder="Gemini API Key" value={apiKey} onChange={e => setApiKey(e.target.value)} style={{width: '100%', padding: '10px', marginBottom: '15px', border: '1px solid #ccc', borderRadius: '5px'}} />
        <input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} style={{width: '100%', padding: '10px', marginBottom: '15px'}} />
        <input type="number" placeholder="Minutes" value={timerMinutes} onChange={e => setTimerMinutes(Number(e.target.value))} style={{width: '100%', padding: '10px', marginBottom: '15px', border: '1px solid #ccc'}} />
        <button onClick={processPDF} style={{width: '100%', padding: '12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold'}}>Start Exam</button>
      </div>
    </div>
  );

  if (appState === 'results') {
    const correct = questions.filter(q => answers[q.id] === q.correctAnswer).length;
    return <div style={{textAlign: 'center', padding: '50px'}}><h1>Score: {correct * 4} / {questions.length * 4}</h1><button onClick={() => window.location.reload()} style={{padding: '10px 20px', marginTop: '20px'}}>Retry</button></div>;
  }

  return (
    <div style={{display: 'flex', minHeight: '100vh', background: '#f1f5f9', padding: '20px'}}>
      <main style={{flex: 1, background: 'white', padding: '30px', borderRadius: '15px', marginRight: '20px'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '20px'}}>
            <h2>Time: {Math.floor(timeLeft/60)}:{(timeLeft%60).toString().padStart(2,'0')}</h2>
            <button onClick={() => setAppState('results')} style={{background: '#dc2626', color: 'white', padding: '8px 16px', borderRadius: '5px', border: 'none'}}>Submit</button>
        </div>
        <p style={{fontSize: '18px', marginBottom: '20px'}}>{questions[currentIdx]?.text}</p>
        <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
          {questions[currentIdx]?.options.map((opt: string, i: number) => (
            <button key={i} onClick={() => setAnswers({...answers, [questions[currentIdx].id]: opt})} style={{padding: '15px', border: '2px solid #e2e8f0', borderRadius: '10px', textAlign: 'left', background: answers[questions[currentIdx].id] === opt ? '#dbeafe' : 'white'}}>{opt}</button>
          ))}
        </div>
        <div style={{marginTop: '30px', display: 'flex', gap: '10px'}}>
            <button disabled={currentIdx === 0} onClick={() => setCurrentIdx(currentIdx - 1)}>Prev</button>
            <button disabled={currentIdx === questions.length - 1} onClick={() => setCurrentIdx(currentIdx + 1)}>Next</button>
        </div>
      </main>
      <aside style={{width: '250px', background: 'white', padding: '20px', borderRadius: '15px'}}>
        <h3>Question Palette</h3>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginTop: '10px'}}>
            {questions.map((_, i) => (
                <button key={i} onClick={() => setCurrentIdx(i)} style={{height: '40px', background: answers[questions[i].id] ? '#10b981' : '#e2e8f0'}}>{i + 1}</button>
            ))}
        </div>
      </aside>
    </div>
  );
}
      
 
