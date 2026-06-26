"use client";

import React, { useState, useEffect, useCallback } from 'react';

export default function ExamPlatform() {
  // App States
  const [appState, setAppState] = useState<'setup' | 'loading' | 'exam' | 'results'>('setup');
  
  // Configuration States
  const [file, setFile] = useState<File | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [timerMinutes, setTimerMinutes] = useState(30);
  const [marksPerQuestion, setMarksPerQuestion] = useState(4);
  const [negativeMarks, setNegativeMarks] = useState(1);

  // Exam States
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [visited, setVisited] = useState<Record<number, boolean>>({ 0: true }); 
  const [timeLeft, setTimeLeft] = useState(0);

  // ---------------------------------------------------------
  // AI PROCESSING LOGIC (The Engine)
  // ---------------------------------------------------------
  const processPDF = async () => {
    if (!file || !apiKey) {
      alert("Please upload a file and enter your Gemini API Key.");
      return;
    }

    setAppState('loading');

    try {
      // 1. Convert file to Base64 so Google can read it
      const base64Data = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });

      // 2. The Prompt for the AI
      const prompt = `You are an expert exam analyzer. Read this document and extract the multiple choice questions. 
      Return ONLY a raw JSON array of objects. Do not include markdown formatting like \`\`\`json.
      Format exactly like this:
      [
        {
          "id": 1,
          "text": "The actual question text?",
          "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
          "correctAnswer": "Option 1",
          "topic": "The main subject of the question"
        }
      ]`;

      // 3. Call Google Gemini API
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: file.type, data: base64Data } }
            ]
          }]
        })
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message);
      }

      // 4. Clean and parse the AI's response
      let aiText = data.candidates[0].content.parts[0].text;
      aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const extractedQQs = JSON.parse(aiText);
      
      // Apply user settings
      const finalQuestions = extractedQQs.map((q: any, index: number) => ({
        ...q,
        id: index + 1,
        marks: marksPerQuestion,
        negative: negativeMarks
      }));

      setQuestions(finalQuestions);
      setTimeLeft(timerMinutes * 60);
      setAppState('exam');

    } catch (error) {
      console.error(error);
      alert("AI failed to read the document. Make sure it's a valid PDF with text and your API key is correct.");
      setAppState('setup');
    }
  };

  // ---------------------------------------------------------
  // EXAM SCREEN LOGIC
  // ---------------------------------------------------------
  const currentQuestion = questions[currentIdx];

  const handleSubmit = useCallback(() => {
    setAppState('results');
  }, []);

  useEffect(() => {
    if (appState !== 'exam') return;
    if (timeLeft <= 0) {
      handleSubmit();
      return;
    }
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, appState, handleSubmit]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const selectOption = (option: string) => {
    setAnswers({ ...answers, [currentQuestion.id]: option });
  };

  const navigateTo = (idx: number) => {
    setCurrentIdx(idx);
    setVisited({ ...visited, [idx]: true });
  };

  // ---------------------------------------------------------
  // RESULTS ANALYTICS LOGIC
  // ---------------------------------------------------------
  const calculateResults = () => {
    let totalScore = 0;
    let correct = 0;
    let wrong = 0;
    let skipped = questions.length - Object.keys(answers).length;

    questions.forEach(q => {
      const userAnswer = answers[q.id];
      if (userAnswer) {
        if (userAnswer === q.correctAnswer) {
          totalScore += q.marks;
          correct++;
        } else {
          totalScore -= q.negative;
          wrong++;
        }
      }
    });

    const maxScore = questions.length * marksPerQuestion;
    const accuracy = correct + wrong > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0;

    return { totalScore, maxScore, correct, wrong, skipped, accuracy };
  };

  // ---------------------------------------------------------
  // RENDERING
  // ---------------------------------------------------------

  if (appState === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
        <h2 className="text-2xl font-bold text-slate-800 animate-pulse">AI is analyzing your PDF...</h2>
        <p className="text-slate-500 mt-2">Extracting questions, options, and topics.</p>
      </div>
    );
  }

  if (appState === 'setup') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans text-slate-900">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-6 text-center">Exam Configuration</h1>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Google Gemini API Key</label>
              <input 
                type="password" 
                placeholder="Paste your API key here..."
                value={apiKey} 
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:border-blue-500"
              />
              <p className="text-xs text-slate-400 mt-1">Stored safely in your browser. Never shared.</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Upload Question Paper (PDF)</label>
              <div className={`relative w-full py-4 px-4 border-2 border-dashed rounded-xl flex items-center justify-center transition-all overflow-hidden ${file ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-bold' : 'border-slate-300 hover:border-blue-500 text-slate-500'}`}>
                <input 
                  type="file" 
                  accept="application/pdf"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <span className="text-center truncate w-full">
                  {file ? `✓ Attached: ${file.name}` : "+ Click to Attach PDF"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Time Limit (Minutes)</label>
                <input 
                  type="number" 
                  value={timerMinutes} 
                  onChange={(e) => setTimerMinutes(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Marks per Q</label>
                <input 
                  type="number" 
                  value={marksPerQuestion} 
                  onChange={(e) => setMarksPerQuestion(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Negative Marks</label>
                <input 
                  type="number" 
                  value={negativeMarks} 
                  onChange={(e) => setNegativeMarks(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <button 
              onClick={processPDF}
              className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${file && apiKey ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
            >
              Analyze & Start Exam
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (appState === 'results') {
    const stats = calculateResults();
    
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl max-w-4xl w-full p-10 grid grid-cols-1 md:grid-cols-2 gap-10">
          
          <div className="flex flex-col justify-center border-r border-slate-100 pr-10">
            <h2 className="text-4xl font-black text-slate-900 mb-2">Exam Over</h2>
            <p className="text-slate-500 font-medium mb-10">Here is your modern performance analysis.</p>
            
            <div className="bg-blue-50 rounded-2xl p-8 text-center border border-blue-100">
              <span className="text-sm font-bold text-blue-500 uppercase tracking-widest">Final Score</span>
              <div className="text-6xl font-black text-blue-900 mt-2">
                {stats.totalScore} <span className="text-2xl text-blue-400">/ {stats.maxScore}</span>
              </div>
            </div>
            
            <button onClick={() => window.location.reload()} className="mt-8 bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-slate-800 transition">
              Take Another Exam
            </button>
          </div>

          <div className="space-y-6 flex flex-col justify-center">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
                <div className="text-3xl font-black text-emerald-600">{stats.correct}</div>
                <div className="text-sm font-semibold text-emerald-800 mt-1">Correct Answers</div>
              </div>
              <div className="bg-red-50 p-6 rounded-2xl border border-red-100">
                <div className="text-3xl font-black text-red-600">{stats.wrong}</div>
                <div className="text-sm font-semibold text-red-800 mt-1">Negative Marks</div>
              </div>
            </div>

            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex justify-between items-center">
              <div>
                <div className="text-2xl font-black text-slate-800">{stats.accuracy}%</div>
                <div className="text-sm font-semibold text-slate-500 mt-1">Overall Accuracy</div>
              </div>
              <div className="w-16 h-16 rounded-full border-4 border-slate-200 flex items-center justify-center">
                <span className="text-xl">🎯</span>
              </div>
            </div>

            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex justify-between items-center">
              <div>
                <div className="text-2xl font-black text-slate-800">{stats.skipped}</div>
                <div className="text-sm font-semibold text-slate-500 mt-1">Skipped Questions</div>
              </div>
              <div className="w-16 h-16 rounded-full border-4 border-slate-200 flex items-center justify-center">
                <span className="text-xl">⏭️</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // --- STANDARD EXAM UI REMAINS THE SAME AS BEFORE ---
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Live Examination</h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="bg-slate-100 border border-slate-200 px-4 py-2 rounded-lg text-center">
            <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Time Left</span>
            <span className={`text-xl font-mono font-bold ${timeLeft < 300 ? 'text-red-600' : 'text-slate-800'}`}>
              {formatTime(timeLeft)}
            </span>
          </div>
          <button onClick={handleSubmit} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium shadow-sm">
            Submit
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 p-8 overflow-y-auto flex flex-col">
          <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm mb-6">
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
              <div className="flex gap-4 items-center">
                <span className="bg-slate-100 text-slate-800 font-bold px-4 py-1.5 rounded-md text-sm">Question {currentIdx + 1}</span>
                <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-md">{currentQuestion.topic}</span>
              </div>
              <div className="text-sm font-medium text-slate-500 flex gap-4">
                <span>Marks: <strong className="text-emerald-600">+{currentQuestion.marks}</strong></span>
                <span>Negative: <strong className="text-red-600">-{currentQuestion.negative}</strong></span>
              </div>
            </div>

            <p className="text-slate-800 text-xl leading-relaxed mb-8 font-medium">{currentQuestion.text}</p>

            <div className="space-y-4">
              {currentQuestion.options.map((option: string, idx: number) => {
                const isSelected = answers[currentQuestion.id] === option;
                return (
                  <button
                    key={idx}
                    onClick={() => selectOption(option)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${isSelected ? 'border-blue-600 bg-blue-50 font-bold shadow-sm' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                  >
                    <span className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold shrink-0 ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-slate-50 text-slate-500'}`}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="text-lg">{option}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-between mt-auto">
            <button disabled={currentIdx === 0} onClick={() => navigateTo(currentIdx - 1)} className="bg-white border border-slate-300 hover:bg-slate-50 px-8 py-3 rounded-xl font-bold transition disabled:opacity-50">← Previous</button>
            <button disabled={currentIdx === questions.length - 1} onClick={() => navigateTo(currentIdx + 1)} className="bg-white border border-slate-300 hover:bg-slate-50 px-8 py-3 rounded-xl font-bold transition disabled:opacity-50">Next →</button>
          </div>
        </div>

        <aside className="w-80 bg-white border-l border-slate-200 p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider mb-6 border-b pb-2">Question Palette</h3>
            <div className="grid grid-cols-4 gap-3">
              {questions.map((q, idx) => {
                let btnClass = "border-slate-200 text-slate-600 bg-white hover:bg-slate-50"; 
                if (answers[q.id]) btnClass = "bg-emerald-500 border-emerald-600 text-white font-bold"; 
                else if (visited[idx]) btnClass = "bg-red-500 border-red-600 text-white font-bold"; 
                if (idx === currentIdx) btnClass += " ring-4 ring-blue-300 ring-offset-1 scale-105 z-10"; 
                
                return (
                  <button key={q.id} onClick={() => navigateTo(idx)} className={`h-12 rounded-lg border-2 text-sm flex items-center justify-center transition-all ${btnClass}`}>
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
            
