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
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (apiKey) localStorage.setItem('gemini_key', apiKey);
  }, [apiKey]);

  const processPDF = async () => {
    if (!file || !apiKey) {
      alert("Please upload a file and enter your API Key.");
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
              { text: `Extract questions from this PDF. Return ONLY valid JSON array. Structure: [{"text": "...", "options": ["A", "B", "C", "D"], "correctAnswer": "A", "topic": "..."}]` },
              { inline_data: { mime_type: file.type, data: base64Data } }
            ]
          }]
        })
      });

      const data = await response.json();
      let text = data.candidates[0].content.parts[0].text;
      const jsonMatch = text.match(/\[.*\]/s); // Robust extraction
      
      if (!jsonMatch) throw new Error("Could not parse AI response");
      
      const parsed = JSON.parse(jsonMatch[0]);
      setQuestions(parsed.map((q: any, i: number) => ({ ...q, id: i + 1, marks: marksPerQuestion, negative: negativeMarks })));
      setTimeLeft(timerMinutes * 60);
      setAppState('exam');
    } catch (err) {
      console.error(err);
      alert("AI failed to process PDF. Ensure PDF has text (not just images) and API key is valid.");
      setAppState('setup');
    }
  };

  useEffect(() => {
    if (appState !== 'exam' || timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, appState]);

  if (appState === 'loading') return <div className="flex min-h-screen items-center justify-center font-bold text-xl">Analyzing PDF...</div>;

  if (appState === 'setup') return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full space-y-4">
        <h1 className="text-xl font-bold">Exam Configuration</h1>
        <input type="password" placeholder="Gemini API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full p-3 border rounded-lg" />
        <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full p-2 border rounded-lg" />
        <button onClick={processPDF} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold">Start Exam</button>
      </div>
    </div>
  );

  if (appState === 'results') {
    const correct = questions.filter(q => answers[q.id] === q.correctAnswer).length;
    return <div className="flex min-h-screen items-center justify-center font-bold text-2xl">Score: {correct * marksPerQuestion} / {questions.length * marksPerQuestion}</div>;
  }

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="flex justify-between mb-8">
        <h1 className="font-bold text-2xl">Exam Time: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</h1>
        <button onClick={() => setAppState('results')} className="bg-red-500 text-white px-6 py-2 rounded-lg">Submit</button>
      </div>
      <div className="space-y-6">
        <h2 className="text-xl">{questions[currentIdx].text}</h2>
        {questions[currentIdx].options.map((opt: string, i: number) => (
          <button key={i} onClick={() => setAnswers({...answers, [questions[currentIdx].id]: opt})} className={`block w-full p-4 border rounded-lg ${answers[questions[currentIdx].id] === opt ? 'bg-blue-100 border-blue-500' : ''}`}>
            {opt}
          </button>
        ))}
      </div>
      <div className="mt-8 flex gap-4">
        <button disabled={currentIdx === 0} onClick={() => setCurrentIdx(currentIdx - 1)} className="px-4 py-2 bg-gray-200 rounded">Prev</button>
        <button disabled={currentIdx === questions.length - 1} onClick={() => setCurrentIdx(currentIdx + 1)} className="px-4 py-2 bg-gray-200 rounded">Next</button>
      </div>
    </div>
  );
}
