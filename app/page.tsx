"use client";

import React, { useState, useEffect, useCallback } from 'react';

// A dummy dataset to simulate the questions extracted from your uploaded PDF/PPT
const extractedQuestions = [
  { id: 1, text: "Which of the following sorting algorithms has a worst-case time complexity of O(n log n)?", options: ["Bubble Sort", "Quick Sort", "Merge Sort", "Selection Sort"] },
  { id: 2, text: "In an operating system, what is a primary cause of thrashing?", options: ["High paging activity", "Low CPU utilization", "Excessive disk space", "Process deadlock"] },
  { id: 3, text: "What is the main advantage of using an index in a relational database?", options: ["Reduces storage space", "Improves data security", "Speeds up data retrieval", "Ensures data integrity"] },
  { id: 4, text: "Which data structure operates on a Last In, First Out (LIFO) principle?", options: ["Queue", "Linked List", "Tree", "Stack"] },
  { id: 5, text: "What does the 'C' in ACID properties of database transactions stand for?", options: ["Concurrency", "Consistency", "Control", "Command"] }
];

export default function ExamPlatform() {
  // App States: 'setup' -> 'exam' -> 'results'
  const [appState, setAppState] = useState<'setup' | 'exam' | 'results'>('setup');
  
  // Configuration States
  const [hasUploaded, setHasUploaded] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(30);
  const [marksPerQuestion, setMarksPerQuestion] = useState(4);
  const [negativeMarks, setNegativeMarks] = useState(1);

  // Exam States
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [visited, setVisited] = useState<Record<number, boolean>>({ 0: true }); // index 0 is visited on start
  const [timeLeft, setTimeLeft] = useState(0);

  // ---------------------------------------------------------
  // SETUP SCREEN LOGIC
  // ---------------------------------------------------------
  const handleStartExam = () => {
    if (!hasUploaded) {
      alert("Please upload a PPT or PDF file first.");
      return;
    }
    
    // Apply user settings to the questions
    const configuredQuestions = extractedQuestions.map(q => ({
      ...q,
      marks: marksPerQuestion,
      negative: negativeMarks
    }));

    setQuestions(configuredQuestions);
    setTimeLeft(timerMinutes * 60);
    setAppState('exam');
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
  // RENDERING
  // ---------------------------------------------------------

  if (appState === 'setup') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans text-slate-900">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-6 text-center">Exam Configuration</h1>
          
          <div className="space-y-6">
            {/* File Upload Simulation */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Upload Question Paper (PDF/PPT)</label>
              <button 
                onClick={() => setHasUploaded(true)}
                className={`w-full py-4 border-2 border-dashed rounded-xl flex items-center justify-center transition-all ${hasUploaded ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-bold' : 'border-slate-300 hover:border-blue-500 hover:bg-blue-50 text-slate-500'}`}
              >
                {hasUploaded ? "✓ Document Uploaded & Parsed" : "+ Click to Attach File"}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Timer Input */}
              <div className="col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Time Limit (Minutes)</label>
                <input 
                  type="number" 
                  value={timerMinutes} 
                  onChange={(e) => setTimerMinutes(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Marks Input */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Marks per Q</label>
                <input 
                  type="number" 
                  value={marksPerQuestion} 
                  onChange={(e) => setMarksPerQuestion(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Negative Marks Input */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Negative Marks</label>
                <input 
                  type="number" 
                  value={negativeMarks} 
                  onChange={(e) => setNegativeMarks(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <button 
              onClick={handleStartExam}
              className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${hasUploaded ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
            >
              Start Examination
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (appState === 'results') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans text-slate-900">
        <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-10 text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl text-emerald-600">✓</span>
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Exam Submitted</h2>
          <p className="text-slate-500 mb-8">Your answers have been locked and submitted for evaluation.</p>
          
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-left space-y-3">
            <h3 className="font-bold text-slate-800 text-lg border-b pb-2 mb-4">Quick Summary</h3>
            <div className="flex justify-between">
              <span className="text-slate-600">Total Questions:</span>
              <span className="font-bold">{questions.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Questions Answered:</span>
              <span className="font-bold text-emerald-600">{Object.keys(answers).length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Skipped/Unanswered:</span>
              <span className="font-bold text-red-600">{questions.length - Object.keys(answers).length}</span>
            </div>
          </div>
          
          <button onClick={() => window.location.reload()} className="mt-8 text-blue-600 font-semibold hover:underline">
            Start a new exam
          </button>
        </div>
      </div>
    );
  }

  // EXAM ENVIRONMENT UI
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Live Examination</h1>
          <p className="text-xs text-slate-500">Do not refresh the page.</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="bg-slate-100 border border-slate-200 px-4 py-2 rounded-lg text-center">
            <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Time Left</span>
            <span className={`text-xl font-mono font-bold ${timeLeft < 300 ? 'text-red-600' : 'text-slate-800'}`}>
              {formatTime(timeLeft)}
            </span>
          </div>
          <button onClick={handleSubmit} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition shadow-sm">
            Submit
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Left Side: Question Canvas */}
        <div className="flex-1 p-8 overflow-y-auto flex flex-col">
          <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm mb-6">
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
              <span className="bg-slate-100 text-slate-800 font-bold px-4 py-1.5 rounded-md text-sm">
                Question {currentIdx + 1}
              </span>
              <div className="text-sm font-medium text-slate-500 flex gap-4">
                <span>Marks: <strong className="text-emerald-600">+{currentQuestion.marks}</strong></span>
                <span>Negative: <strong className="text-red-600">-{currentQuestion.negative}</strong></span>
              </div>
            </div>

            <p className="text-slate-800 text-xl leading-relaxed mb-8 font-medium">
              {currentQuestion.text}
            </p>

            <div className="space-y-4">
              {currentQuestion.options.map((option: string, idx: number) => {
                const isSelected = answers[currentQuestion.id] === option;
                return (
                  <button
                    key={idx}
                    onClick={() => selectOption(option)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50 text-blue-900 font-bold shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold shrink-0 ${
                      isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-slate-50 text-slate-500'
                    }`}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="text-lg">{option}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-between mt-auto">
            <button
              disabled={currentIdx === 0}
              onClick={() => navigateTo(currentIdx - 1)}
              className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-8 py-3 rounded-xl font-bold transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              ← Previous
            </button>
            <button
              disabled={currentIdx === questions.length - 1}
              onClick={() => navigateTo(currentIdx + 1)}
              className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-8 py-3 rounded-xl font-bold transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              Next →
            </button>
          </div>
        </div>

        {/* Right Side: Question Palette */}
        <aside className="w-80 bg-white border-l border-slate-200 p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider mb-6 border-b pb-2">Question Palette</h3>
            <div className="grid grid-cols-4 gap-3">
              {questions.map((q, idx) => {
                const isCurrent = idx === currentIdx;
                const isAnswered = !!answers[q.id];
                const isVisited = !!visited[idx];

                // Determine precise styling based on user request
                let btnClass = "border-slate-200 text-slate-600 bg-white hover:bg-slate-50"; // Unvisited
                
                if (isAnswered) {
                  btnClass = "bg-emerald-500 border-emerald-600 text-white font-bold shadow-sm"; // Answered = Green
                } else if (isVisited) {
                  btnClass = "bg-red-500 border-red-600 text-white font-bold shadow-sm"; // Visited but Not Answered = Red
                }
                
                if (isCurrent) {
                  btnClass += " ring-4 ring-blue-300 ring-offset-1 scale-105 z-10"; // Highlight current
                }

                return (
                  <button
                    key={q.id}
                    onClick={() => navigateTo(idx)}
                    className={`h-12 rounded-lg border-2 text-sm flex items-center justify-center transition-all ${btnClass}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Indicator Legend Panel */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Legend</h4>
            <div className="flex items-center gap-3 text-sm font-medium text-slate-700">
              <span className="w-5 h-5 bg-emerald-500 rounded-md block shadow-sm"></span>
              <span>Answered</span>
            </div>
            <div className="flex items-center gap-3 text-sm font-medium text-slate-700">
              <span className="w-5 h-5 bg-red-500 rounded-md block shadow-sm"></span>
              <span>Not Answered</span>
            </div>
            <div className="flex items-center gap-3 text-sm font-medium text-slate-700">
              <span className="w-5 h-5 bg-white border-2 border-slate-200 rounded-md block shadow-sm"></span>
              <span>Not Visited</span>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}