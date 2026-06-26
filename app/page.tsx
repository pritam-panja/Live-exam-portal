"use client";

import React, { useState, useEffect } from 'react';

export default function ExamPlatform() {
  const [appState, setAppState] = useState<'setup' | 'loading' | 'exam' | 'results'>('setup');
  const [file, setFile] = useState<File | null>(null);
  const [apiKey, setApiKey] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('gemini_key') || "" : ""));
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
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
      setQuestions(parsed.map((q: any, i: number) => ({ ...q, id: i + 1, marks: 4, negative: 1 })));
      setTimeLeft(30 * 60);
      setAppState('exam');
    } catch (err) {
      alert("AI failed to read file. Please try a text-based PDF.");
      setAppState('setup');
    }
  };

  if (appState === 'loading') return <div className="flex min-h-screen items-center justify-center font-bold text-xl bg-slate-50">Analyzing PDF...</div>;

  if (appState === 'setup') return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full space-y-6">
        <h1 className="text-2xl font-bold text-center">Exam Setup</h1>
        <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-600">Gemini API Key</label>
            <input type="password" placeholder="Paste your API key here" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg" />
        </div>
        <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-600">Upload PDF</label>
            <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full p-3 border border-slate-300 rounded-lg bg-slate-50" />
        </div>
        <button onClick={processPDF} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700">Start Exam</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white p-8 max-w-3xl mx-auto">
        <div className="mb-6 flex justify-between items-center border-b pb-4">
            <h2 className="font-bold text-xl">Question {currentIdx + 1}</h2>
            <button onClick={() => setAppState('setup')} className="text-sm text-red-500 font-semibold">Exit Exam</button>
        </div>
        <div className="space-y-6">
            <p className="text-lg font-medium">{questions[currentIdx]?.text}</p>
            {questions[currentIdx]?.options.map((opt: string, i: number) => (
            <button key={i} onClick={() => setAnswers({...answers, [questions[currentIdx].id]: opt})} 
                className={`block w-full p-4 border rounded-xl text-left transition ${answers[questions[currentIdx].id] === opt ? 'bg-blue-600 text-white' : 'bg-slate-50 hover:bg-slate-100'}`}>
                {opt}
            </button>
            ))}
        </div>
        <div className="mt-8 flex justify-between">
            <button disabled={currentIdx === 0} onClick={() => setCurrentIdx(currentIdx - 1)} className="px-6 py-2 bg-gray-200 rounded-lg">Prev</button>
            <button disabled={currentIdx === questions.length - 1} onClick={() => setCurrentIdx(currentIdx + 1)} className="px-6 py-2 bg-gray-200 rounded-lg">Next</button>
        </div>
    </div>
  );
}
