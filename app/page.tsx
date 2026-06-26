"use client";

import React, { useState, useEffect, useCallback } from 'react';

export default function ExamPlatform() {
  const [appState, setAppState] = useState<'setup' | 'loading' | 'exam' | 'results'>('setup');
  const [file, setFile] = useState<File | null>(null);
  const [apiKey, setApiKey] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('gemini_key') || "" : ""));
  const [timerMinutes, setTimerMinutes] = useState(30);
  const [marksPerQuestion, setMarksPerQuestion] = useState(4);
  const [negativeMarks, setNegativeMarks] = useState(1);
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [visited, setVisited] = useState<Record<number, boolean>>({ 0: true });
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (apiKey) localStorage.setItem('gemini_key', apiKey);
  }, [apiKey]);

  const processPDF = async () => {
    if (!file || !apiKey) {
      alert("Please upload a PDF and enter your Gemini API Key.");
      return;
    }
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
          contents: [{
            parts: [
              { text: `Extract questions from this PDF. Return ONLY valid JSON array. Structure: [{"text": "Question?", "options": ["A", "B", "C", "D"], "correctAnswer": "A", "topic": "General"}]` },
              { inline_data: { mime_type: "application/pdf", data: base64Data } }
            ]
          }]
        })
      });

      const data = await response.json();
      const text = data.candidates[0].content.parts[0].text;
      const jsonMatch = text.match(/\[.*\]/s);
      if (!jsonMatch) throw new Error("Parse failed");
      
      const parsed = JSON.parse(jsonMatch[0]);
      setQuestions(parsed.map((q: any, i: number) => ({ ...q, id: i + 1, marks: marksPerQuestion, negative: negativeMarks })));
      setTimeLeft(timerMinutes * 60);
      setAppState('exam');
    } catch (err) {
      alert("AI failed to read file. Try a text-based PDF.");
      setAppState('setup');
    }
  };

  useEffect(() => {
    if (appState !== 'exam' || timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, appState]);

  if (appState === 'loading') return <div className="flex min-h-screen items-center justify-center font-bold text-xl bg-slate-50">Analyzing PDF...</div>;

  if (appState === 'setup') return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full space-y-6">
        <h1 className="text-2xl font-bold text-center">Exam Configuration</h1>
        <input type="password" placeholder="Gemini API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full p-3 border rounded-lg" />
        <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full p-3 border rounded-lg bg-slate-50" />
        <div className="grid grid-cols-3 gap-2">
            <input type="number" placeholder="Time (m)" value={timerMinutes} onChange={e => setTimerMinutes(Number(e.target.value))} className="p-2 border rounded text-sm" />
            <input type="number" placeholder="Marks" value={marksPerQuestion} onChange={e => setMarksPerQuestion(Number(e.target.value))} className="p-2 border rounded text-sm" />
            <input type="number" placeholder="Neg" value={negativeMarks} onChange={e => setNegativeMarks(Number(e.target.value))} className="p-2 border rounded text-sm" />
        </div>
        <button onClick={processPDF} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700">Start Exam</button>
      </div>
    </div>
  );

  if (appState === 'results') {
    const correct = questions.filter(q => answers[q.id] === q.correctAnswer).length;
    const wrong = Object.keys(answers).filter(id => answers[Number(id)] && answers[Number(id)] !== questions.find(q => q.id === Number(id))?.correctAnswer).length;
    const totalScore = (correct * marksPerQuestion) - (wrong * negativeMarks);
    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
            <div className="bg-white rounded-3xl shadow-xl max-w-lg w-full p-10 text-center">
                <h2 className="text-3xl font-black mb-6">Exam Results</h2>
                <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-emerald-50 p-6 rounded-2xl border"><div className="text-3xl font-bold">{correct}</div><div>Correct</div></div>
                    <div className="bg-red-50 p-6 rounded-2xl border"><div className="text-3xl font-bold">{wrong}</div><div>Wrong</div></div>
                </div>
                <div className="text-4xl font-black text-blue-600 mb-6">{totalScore} <span className="text-lg text-slate-400">/ {questions.length * marksPerQuestion}</span></div>
                <button onClick={() => window.location.reload()} className="bg-slate-900 text-white py-3 px-8 rounded-xl font-bold">Start New Exam</button>
            </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <main className="flex-1 p-8">
        <header className="flex justify-between items-center mb-8 bg-white p-4 rounded-xl shadow-sm">
            <h1 className="font-bold text-xl">Time: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</h1>
            <button onClick={() => setAppState('results')} className="bg-red-600 text-white px-6 py-2 rounded-lg font-bold">Submit</button>
        </header>
        <div className="bg-white p-8 rounded-xl shadow-sm mb-6">
            <p className="text-xl mb-8">{questions[currentIdx]?.text}</p>
            <div className="space-y-4">
                {questions[currentIdx]?.options.map((opt: string, i: number) => (
                    <button key={i} onClick={() => setAnswers({...answers, [questions[currentIdx].id]: opt})} 
                        className={`block w-full p-4 border-2 rounded-xl text-left transition ${answers[questions[currentIdx].id] === opt ? 'border-blue-600 bg-blue-50 font-bold' : 'bg-slate-50 hover:bg-slate-100'}`}>
                        {opt}
                    </button>
                ))}
            </div>
        </div>
        <div className="flex gap-4">
            <button disabled={currentIdx === 0} onClick={() => {setCurrentIdx(currentIdx - 1); setVisited({...visited, [currentIdx-1]: true})}} className="px-8 py-3 bg-white border rounded-xl font-bold">Prev</button>
            <button disabled={currentIdx === questions.length - 1} onClick={() => {setCurrentIdx(currentIdx + 1); setVisited({...visited, [currentIdx+1]: true})}} className="px-8 py-3 bg-white border rounded-xl font-bold">Next</button>
        </div>
      </main>
      <aside className="w-80 bg-white border-l p-6">
        <h2 className="font-bold mb-4">Question Palette</h2>
        <div className="grid grid-cols-4 gap-2">
            {questions.map((q, i) => (
                <button key={i} onClick={() => {setCurrentIdx(i); setVisited({...visited, [i]: true})}} 
                    className={`h-10 w-10 rounded border font-bold ${answers[q.id] ? 'bg-emerald-500 text-white' : (visited[i] ? 'bg-red-500 text-white' : 'bg-gray-100')}`}>
                    {i+1}
                </button>
            ))}
        </div>
      </aside>
    </div>
  );
}
      
 
