import { useState, useEffect, useRef } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import {
  Users, Save, Trophy, Download, ChevronLeft, Check,
  Settings, Plus, Trash2, Pencil, Cloud, CloudOff, Calendar, Timer,
} from "lucide-react";

const CRITERIA = [
  { key: "pronunciation", label: "발음", sub: "Pronunciation" },
  { key: "fluency", label: "유창성", sub: "Fluency" },
  { key: "confidence", label: "자신감", sub: "Confidence" },
  { key: "accuracy", label: "암기 정확도", sub: "Accuracy" },
];
const TOTAL_SENTENCES = 30;
const MAX_TOTAL = 20 + TOTAL_SENTENCES;
const SCORE_OPTIONS = [0, 1, 2, 3, 4, 5];

const DEFAULT_CLASSES = {}; // Firestore에 데이터 없을 때 빈 상태로 시작

function emptyScore() {
  return {
    pronunciation: 0, fluency: 0, confidence: 0, accuracy: 0,
    sentences: Array(TOTAL_SENTENCES).fill(false),
    note: "", recordedTime: null,
  };
}
function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function getLastUsedMonth() {
  return localStorage.getItem("eie-shouting-lastMonth") || getCurrentMonthKey();
}
function saveLastUsedMonth(mk) {
  localStorage.setItem("eie-shouting-lastMonth", mk);
}
function monthKeyToLabel(key) {
  const [y, m] = key.split("-");
  return `${y}년 ${parseInt(m, 10)}월`;
}
function buildMonthKey(y, m) {
  return `${y}-${String(m).padStart(2, "0")}`;
}
function formatTime(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function timeToSeconds(t) {
  if (!t) return Infinity;
  const [m, s] = t.split(":").map(Number);
  return m * 60 + s;
}

const CLASSES_DOC = { col: "shoutingMeta", doc: "classes" };
const scoresRef = (mk) => ({ col: "shoutingScores", doc: mk });

export default function App() {
  const [classes, setClasses] = useState(DEFAULT_CLASSES);
  const [scoresByMonth, setScoresByMonth] = useState({});
  const [availableMonths, setAvailableMonths] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(getLastUsedMonth());
  const [loaded, setLoaded] = useState(false);
  const [connError, setConnError] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState("home");
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [rankingMonth, setRankingMonth] = useState(getLastUsedMonth());
  const [showMonthCreator, setShowMonthCreator] = useState(false);
  const [newMonthYear, setNewMonthYear] = useState(new Date().getFullYear());
  const [newMonthMonth, setNewMonthMonth] = useState(new Date().getMonth() + 1);
  // 달 이동 관련 state
  const [showMovePanel, setShowMovePanel] = useState(false);
  const [moveYear, setMoveYear] = useState(new Date().getFullYear());
  const [moveMonth, setMoveMonth] = useState(new Date().getMonth() + 1);

  const saveTimer = useRef(null);
  const skipNextSave = useRef(false);
  const loadedMonths = useRef(new Set());
  const pendingTimeRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const ref = doc(db, CLASSES_DOC.col, CLASSES_DOC.doc);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const d = snap.data();
          if (d.classes) { skipNextSave.current = true; setClasses(d.classes); }
        }
        // 데이터 없으면 빈 상태로 시작 (덮어쓰지 않음)
        setConnError(false);
      } catch (e) { setConnError(true); }
      finally { setLoaded(true); }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        const ref = doc(db, "shoutingMeta", "monthsList");
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const months = snap.data().months || [];
          setAvailableMonths((p) => Array.from(new Set([...p, ...months])).sort());
          for (const m of months) await ensureMonthLoaded(m);
        }
        await ensureMonthLoaded(currentMonth);
      } catch (e) { setConnError(true); }
    })();
    // eslint-disable-next-line
  }, [loaded]);

  async function ensureMonthLoaded(mk) {
    if (loadedMonths.current.has(mk)) return;
    try {
      const { col, doc: d } = scoresRef(mk);
      const ref = doc(db, col, d);
      const snap = await getDoc(ref);
      skipNextSave.current = true;
      setScoresByMonth((p) => ({ ...p, [mk]: snap.exists() ? (snap.data().scores || {}) : {} }));
      if (snap.exists()) setAvailableMonths((p) => Array.from(new Set([...p, mk])).sort());
      loadedMonths.current.add(mk);
    } catch (e) { setConnError(true); }
  }

  useEffect(() => {
    if (!loaded) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSyncing(true);
      try {
        await setDoc(doc(db, CLASSES_DOC.col, CLASSES_DOC.doc), { classes, updatedAt: Date.now() });
        setConnError(false);
      } catch (e) { setConnError(true); }
      finally { setSyncing(false); }
    }, 500);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line
  }, [classes, loaded]);

  async function saveMonthScores(mk, monthScores) {
    setSyncing(true);
    try {
      const { col, doc: d } = scoresRef(mk);
      await setDoc(doc(db, col, d), { scores: monthScores, updatedAt: Date.now() });
      if (!availableMonths.includes(mk)) {
        const newMonths = Array.from(new Set([...availableMonths, mk])).sort();
        setAvailableMonths(newMonths);
        await setDoc(doc(db, "shoutingMeta", "monthsList"), { months: newMonths, updatedAt: Date.now() });
      }
      setConnError(false);
    } catch (e) { setConnError(true); }
    finally { setSyncing(false); }
  }

  function getScore(mk, cls, student) {
    return scoresByMonth?.[mk]?.[cls]?.[student] || emptyScore();
  }

  function updateScoreImmediate(mk, cls, student, updater) {
    setScoresByMonth((prev) => {
      const ms = prev[mk] || {};
      const cs = ms[cls] || {};
      const newScore = updater(cs[student] || emptyScore());
      const newMs = { ...ms, [cls]: { ...cs, [student]: newScore } };
      // setState 콜백 밖에서 저장 (안정성)
      setTimeout(() => saveMonthScores(mk, newMs), 0);
      return { ...prev, [mk]: newMs };
    });
  }

  function handleSave() {
    const pendingTime = pendingTimeRef.current;
    setScoresByMonth((prev) => {
      const ms = prev[currentMonth] || {};
      const cs = ms[selectedClass] || {};
      const cur = cs[selectedStudent] || emptyScore();
      const newScore = pendingTime ? { ...cur, recordedTime: pendingTime } : cur;
      const newMs = { ...ms, [selectedClass]: { ...cs, [selectedStudent]: newScore } };
      setTimeout(() => saveMonthScores(currentMonth, newMs), 0);
      pendingTimeRef.current = null;
      return { ...prev, [currentMonth]: newMs };
    });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  function calcTotal(s) {
    return (s.pronunciation || 0) + (s.fluency || 0) + (s.confidence || 0) + (s.accuracy || 0)
      + (s.sentences || []).filter(Boolean).length;
  }

  function exportCSV(mk) {
    const rows = [["월", "순위", "반", "이름", "발음", "유창성", "자신감", "암기정확도", "맞은문장수", "총점", "시간", "비고"]];
    const entries = [];
    Object.entries(classes).forEach(([cls, students]) => {
      students.forEach((student) => {
        const s = getScore(mk, cls, student);
        entries.push({ cls, student, s, total: calcTotal(s) });
      });
    });
    entries.sort((a, b) => b.total - a.total || timeToSeconds(a.s.recordedTime) - timeToSeconds(b.s.recordedTime));
    entries.forEach((e, i) => {
      rows.push([
        monthKeyToLabel(mk), i + 1, e.cls, e.student,
        e.s.pronunciation || 0, e.s.fluency || 0, e.s.confidence || 0, e.s.accuracy || 0,
        (e.s.sentences || []).filter(Boolean).length, e.total,
        e.s.recordedTime || "-", e.s.note || "",
      ]);
    });
    const csv = "\uFEFF" + rows.map((r) => r.map((c) => {
      const s = String(c ?? "");
      return s.includes(",") || s.includes('"') ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `EiE_Shouting_랭킹_${mk}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  async function handleMoveClass() {
    const targetKey = buildMonthKey(moveYear, moveMonth);
    if (targetKey === currentMonth) { alert("현재 달과 같은 달이에요."); return; }
    if (!window.confirm(`"${selectedClass}" 반 기록을 ${monthKeyToLabel(currentMonth)}에서 ${monthKeyToLabel(targetKey)}로 이동할까요?\n\n원래 달(${monthKeyToLabel(currentMonth)})의 이 반 기록은 초기화됩니다.`)) return;

    await ensureMonthLoaded(targetKey);

    setScoresByMonth((prev) => {
      const srcMonth = prev[currentMonth] || {};
      const dstMonth = prev[targetKey] || {};
      const classData = srcMonth[selectedClass] || {};
      const newDstMonth = { ...dstMonth, [selectedClass]: classData };
      const newSrcMonth = { ...srcMonth };
      delete newSrcMonth[selectedClass];
      const next = { ...prev, [currentMonth]: newSrcMonth, [targetKey]: newDstMonth };
      saveMonthScores(currentMonth, newSrcMonth);
      saveMonthScores(targetKey, newDstMonth);
      return next;
    });

    setShowMovePanel(false);
    alert(`이동 완료! ${monthKeyToLabel(targetKey)}에서 확인하세요.`);
  }

  function addClass(n) { const t = n.trim(); if (!t || classes[t]) return false; setClasses((p) => ({ ...p, [t]: [] })); return true; }
  function renameClass(o, n) {
    const t = n.trim(); if (!t || t === o || classes[t]) return false;
    setClasses((p) => { const x = {}; Object.entries(p).forEach(([k, v]) => { x[k === o ? t : k] = v; }); return x; }); return true;
  }
  function deleteClass(c) { setClasses((p) => { const x = { ...p }; delete x[c]; return x; }); }
  function addStudent(c, n) { const t = n.trim(); if (!t || (classes[c] || []).includes(t)) return false; setClasses((p) => ({ ...p, [c]: [...(p[c] || []), t] })); return true; }
  function renameStudent(c, o, n) {
    const t = n.trim(); if (!t || t === o || (classes[c] || []).includes(t)) return false;
    setClasses((p) => ({ ...p, [c]: (p[c] || []).map((s) => s === o ? t : s) })); return true;
  }
  function deleteStudent(c, s) { setClasses((p) => ({ ...p, [c]: (p[c] || []).filter((x) => x !== s) })); }

  if (!loaded) return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-amber-50 to-rose-50 flex items-center justify-center">
      <div className="text-rose-400 text-sm">Firebase에 연결 중...</div>
    </div>
  );

  const SyncBadge = () => (
    <div className={`fixed bottom-3 right-3 flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full shadow-sm ${connError ? "bg-red-100 text-red-600" : syncing ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
      {connError ? <><CloudOff size={13} /> 연결 끊김</> : syncing ? <><Cloud size={13} className="animate-pulse" /> 저장 중...</> : <><Cloud size={13} /> 클라우드 저장됨</>}
    </div>
  );

  // ---------- HOME ----------
  if (view === "home") return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-amber-50 to-rose-50 p-6">
      <SyncBadge />
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-6 pt-6">
          <h1 className="text-3xl font-bold text-rose-900 mb-1">EiE Shouting Time</h1>
          <p className="text-rose-500 text-sm">스피킹 채점 기록창</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-rose-200 p-3 mb-5">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Calendar size={16} className="text-rose-700" />
            <span className="text-sm text-gray-500">채점 중인 시험 회차:</span>
            <select value={currentMonth} onChange={async (e) => { setCurrentMonth(e.target.value); saveLastUsedMonth(e.target.value); await ensureMonthLoaded(e.target.value); }}
              className="text-sm font-bold text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1 focus:outline-none">
              {!availableMonths.includes(currentMonth) && <option value={currentMonth}>{monthKeyToLabel(currentMonth)} (신규)</option>}
              {availableMonths.map((m) => <option key={m} value={m}>{monthKeyToLabel(m)}</option>)}
            </select>
            <button onClick={() => setShowMonthCreator((v) => !v)} className="text-xs text-rose-600 hover:text-rose-800 underline ml-1">다른 달 만들기</button>
          </div>
          {showMonthCreator && (
            <div className="flex items-center justify-center gap-2 pt-2 border-t border-rose-100 mt-2">
              <select value={newMonthYear} onChange={(e) => setNewMonthYear(+e.target.value)} className="text-sm border border-rose-200 rounded-lg px-2 py-1 focus:outline-none">
                {Array.from({ length: 5 }).map((_, i) => { const y = new Date().getFullYear() - 1 + i; return <option key={y} value={y}>{y}년</option>; })}
              </select>
              <select value={newMonthMonth} onChange={(e) => setNewMonthMonth(+e.target.value)} className="text-sm border border-rose-200 rounded-lg px-2 py-1 focus:outline-none">
                {Array.from({ length: 12 }).map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}월</option>)}
              </select>
              <button onClick={async () => { const k = buildMonthKey(newMonthYear, newMonthMonth); setCurrentMonth(k); saveLastUsedMonth(k); await ensureMonthLoaded(k); setShowMonthCreator(false); }}
                className="flex items-center gap-1 bg-rose-800 hover:bg-rose-900 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">
                <Plus size={14} /> 생성
              </button>
              <button onClick={() => setShowMonthCreator(false)} className="text-sm text-gray-400 hover:text-gray-600 px-2 py-1.5">취소</button>
            </div>
          )}
        </div>

        <div className="flex gap-3 mb-6">
          <button onClick={() => { setRankingMonth(currentMonth); setView("ranking"); }} className="flex-1 flex items-center justify-center gap-2 bg-rose-900 hover:bg-rose-800 text-white font-semibold py-3 rounded-2xl shadow-md transition-colors">
            <Trophy size={20} /> 전체 랭킹 보기
          </button>
          <button onClick={() => setView("manage")} className="flex items-center justify-center gap-2 bg-white hover:bg-rose-50 text-rose-800 font-semibold py-3 px-4 rounded-2xl shadow-sm border border-rose-200 transition-colors">
            <Settings size={20} /> 반/학생 관리
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {Object.entries(classes).map(([cls, students]) => {
            const doneCount = students.filter((s) => { const sc = scoresByMonth?.[currentMonth]?.[cls]?.[s]; return sc && calcTotal(sc) > 0; }).length;
            return (
              <button key={cls} onClick={() => { setSelectedClass(cls); setSelectedStudent(null); setShowMovePanel(false); setView("scoring"); }}
                className="bg-white rounded-2xl shadow-sm hover:shadow-md p-5 text-left transition-all border border-rose-100 hover:border-rose-300">
                <div className="flex items-center gap-2 text-rose-800 font-bold text-lg mb-1"><Users size={18} /> {cls}</div>
                <div className="text-sm text-gray-500">학생 {students.length}명 · 채점완료 {doneCount}명</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ---------- MANAGE ----------
  if (view === "manage") return (
    <><SyncBadge /><ManageView classes={classes} onBack={() => setView("home")} actions={{ addClass, renameClass, deleteClass, addStudent, renameStudent, deleteStudent }} /></>
  );

  // ---------- RANKING ----------
  if (view === "ranking") {
    const monthOptions = Array.from(new Set([...availableMonths, currentMonth])).sort();
    const allEntries = [];
    Object.entries(classes).forEach(([cls, students]) => {
      students.forEach((student) => {
        const s = getScore(rankingMonth, cls, student);
        allEntries.push({ cls, student, s, total: calcTotal(s) });
      });
    });
    allEntries.sort((a, b) => b.total - a.total || timeToSeconds(a.s.recordedTime) - timeToSeconds(b.s.recordedTime));
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-amber-50 to-rose-50 p-6">
        <SyncBadge />
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-4 pt-2">
            <button onClick={() => setView("home")} className="flex items-center gap-1 text-rose-700 font-medium hover:text-rose-900"><ChevronLeft size={20} /> 뒤로</button>
            <h1 className="text-xl font-bold text-rose-900 flex items-center gap-2"><Trophy size={20} /> 전체 학원생 랭킹</h1>
            <button onClick={() => exportCSV(rankingMonth)} className="flex items-center gap-1 bg-rose-900 hover:bg-rose-800 text-white text-sm font-medium px-3 py-2 rounded-xl shadow-sm transition-colors">
              <Download size={16} /> 엑셀(CSV)
            </button>
          </div>
          <div className="flex items-center justify-center gap-2 mb-4">
            <Calendar size={16} className="text-rose-700" />
            <select value={rankingMonth} onChange={async (e) => { setRankingMonth(e.target.value); await ensureMonthLoaded(e.target.value); }}
              className="text-sm font-bold text-rose-800 bg-white border border-rose-200 rounded-lg px-3 py-1.5 focus:outline-none shadow-sm">
              {monthOptions.map((m) => <option key={m} value={m}>{monthKeyToLabel(m)}</option>)}
            </select>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-rose-900 text-white">
                  <th className="py-3 px-3 text-center w-12">순위</th>
                  <th className="py-3 px-3 text-left">이름</th>
                  <th className="py-3 px-3 text-left">반</th>
                  <th className="py-3 px-3 text-center">발음</th>
                  <th className="py-3 px-3 text-center">유창성</th>
                  <th className="py-3 px-3 text-center">자신감</th>
                  <th className="py-3 px-3 text-center">정확도</th>
                  <th className="py-3 px-3 text-center">맞은문장</th>
                  <th className="py-3 px-3 text-center">총점</th>
                  <th className="py-3 px-3 text-center">시간</th>
                </tr>
              </thead>
              <tbody>
                {allEntries.map((e, idx) => {
                  const rank = idx + 1;
                  return (
                    <tr key={e.cls + e.student} className={`border-b border-rose-50 ${rank <= 3 ? "bg-amber-50" : idx % 2 === 0 ? "bg-white" : "bg-rose-50/30"}`}>
                      <td className="py-2.5 px-3 text-center font-bold">{rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank}</td>
                      <td className="py-2.5 px-3 font-medium text-gray-800">{e.student}</td>
                      <td className="py-2.5 px-3 text-gray-500">{e.cls}</td>
                      <td className="py-2.5 px-3 text-center">{e.s.pronunciation || 0}</td>
                      <td className="py-2.5 px-3 text-center">{e.s.fluency || 0}</td>
                      <td className="py-2.5 px-3 text-center">{e.s.confidence || 0}</td>
                      <td className="py-2.5 px-3 text-center">{e.s.accuracy || 0}</td>
                      <td className="py-2.5 px-3 text-center">{(e.s.sentences || []).filter(Boolean).length}/30</td>
                      <td className="py-2.5 px-3 text-center font-bold text-rose-800">{e.total}/{MAX_TOTAL}</td>
                      <td className="py-2.5 px-3 text-center text-gray-600">{e.s.recordedTime || "-"}</td>
                    </tr>
                  );
                })}
                {allEntries.length === 0 && <tr><td colSpan={10} className="py-8 text-center text-gray-400">이 달 채점 기록이 없어요.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ---------- SCORING (학생 목록) ----------
  if (view === "scoring" && !selectedStudent) {
    const students = classes[selectedClass] || [];
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-amber-50 to-rose-50 p-6">
        <SyncBadge />
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2 pt-2">
            <button onClick={() => setView("home")} className="flex items-center gap-1 text-rose-700 font-medium hover:text-rose-900"><ChevronLeft size={20} /> 뒤로</button>
            <h1 className="text-xl font-bold text-rose-900">{selectedClass}</h1>
            <div className="w-16" />
          </div>
          <div className="text-center text-xs text-rose-500 mb-4">{monthKeyToLabel(currentMonth)} 채점 중</div>

          {/* 달 이동 패널 */}
          <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-4 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">이 반 기록을 다른 달로 이동</span>
              <button onClick={() => setShowMovePanel((v) => !v)} className="text-xs text-rose-600 hover:text-rose-800 underline">
                {showMovePanel ? "닫기" : "달 이동하기"}
              </button>
            </div>
            {showMovePanel && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-rose-100 flex-wrap">
                <span className="text-sm text-gray-500">이동할 달:</span>
                <select value={moveYear} onChange={(e) => setMoveYear(+e.target.value)} className="text-sm border border-rose-200 rounded-lg px-2 py-1 focus:outline-none">
                  {Array.from({ length: 5 }).map((_, i) => { const y = new Date().getFullYear() - 1 + i; return <option key={y} value={y}>{y}년</option>; })}
                </select>
                <select value={moveMonth} onChange={(e) => setMoveMonth(+e.target.value)} className="text-sm border border-rose-200 rounded-lg px-2 py-1 focus:outline-none">
                  {Array.from({ length: 12 }).map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}월</option>)}
                </select>
                <button onClick={handleMoveClass} className="flex items-center gap-1 bg-rose-800 hover:bg-rose-900 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">
                  이동
                </button>
                <button onClick={() => setShowMovePanel(false)} className="text-sm text-gray-400 hover:text-gray-600 px-2">취소</button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            {students.map((student) => {
              const s = getScore(currentMonth, selectedClass, student);
              const total = calcTotal(s);
              const isDone = total > 0;
              return (
                <button key={student} onClick={() => { pendingTimeRef.current = null; setSelectedStudent(student); }}
                  className="w-full flex items-center justify-between bg-white rounded-xl shadow-sm border border-rose-100 hover:border-rose-300 px-4 py-3.5 transition-all">
                  <span className="font-medium text-gray-800">{student}</span>
                  <div className="flex items-center gap-2">
                    {s.recordedTime && (
                      <span className="flex items-center gap-1 text.xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        <Timer size={11} /> {s.recordedTime}
                      </span>
                    )}
                    <span className={`text-sm font-semibold px-3 py-1 rounded-full ${isDone ? "bg-rose-100 text-rose-700" : "bg-gray-100 text-gray-400"}`}>
                      {isDone ? `${total}/${MAX_TOTAL}점` : "미채점"}
                    </span>
                  </div>
                </button>
              );
            })}
            {students.length === 0 && <div className="text-center text-gray-400 text-sm bg-white rounded-xl p-6 border border-rose-100">이 반에 등록된 학생이 없어요.</div>}
          </div>
        </div>
      </div>
    );
  }

  // ---------- SCORING (개별 학생) ----------
  if (view === "scoring" && selectedStudent) {
    const score = getScore(currentMonth, selectedClass, selectedStudent);
    const total = calcTotal(score);
    const sentenceCount = (score.sentences || []).filter(Boolean).length;
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-amber-50 to-rose-50 p-6">
        <SyncBadge />
        <div className="max-w-2xl mx-auto pb-10">
          <div className="flex items-center justify-between mb-1 pt-2">
            <button onClick={() => { pendingTimeRef.current = null; setSelectedStudent(null); }} className="flex items-center gap-1 text-rose-700 font-medium hover:text-rose-900">
              <ChevronLeft size={20} /> {selectedClass}
            </button>
            <h1 className="text-xl font-bold text-rose-900">{selectedStudent}</h1>
            <div className="w-16 text-right"><span className="text-sm font-bold text-rose-800">{total}/{MAX_TOTAL}</span></div>
          </div>
          <div className="text-center text-xs text-rose-500 mb-4">{monthKeyToLabel(currentMonth)} 채점</div>

          <TimerBlock recordedTime={score.recordedTime} onTimeUpdate={(t) => { pendingTimeRef.current = t; }} />

          <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-4 mb-4">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-500">맞은 문장 체크 (총 30문장)</h2>
              <span className="text-sm font-semibold text-rose-700">{sentenceCount}/30</span>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {Array.from({ length: TOTAL_SENTENCES }).map((_, i) => {
                const checked = score.sentences?.[i] || false;
                return (
                  <button key={i} onClick={() => updateScoreImmediate(currentMonth, selectedClass, selectedStudent, (prev) => {
                    const ns = [...(prev.sentences || Array(TOTAL_SENTENCES).fill(false))];
                    ns[i] = !ns[i];
                    return { ...prev, sentences: ns };
                  })} className={`aspect-square rounded-lg flex items-center justify-center text-xs font-semibold border-2 transition-colors ${checked ? "bg-rose-700 border-rose-700 text-white" : "bg-white border-rose-200 text-rose-300 hover:border-rose-400"}`}>
                    {checked ? <Check size={14} /> : i + 1}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => updateScoreImmediate(currentMonth, selectedClass, selectedStudent, (p) => ({ ...p, sentences: Array(TOTAL_SENTENCES).fill(true) }))} className="text-xs text-rose-600 hover:text-rose-800 underline">전체 체크</button>
              <button onClick={() => updateScoreImmediate(currentMonth, selectedClass, selectedStudent, (p) => ({ ...p, sentences: Array(TOTAL_SENTENCES).fill(false) }))} className="text-xs text-gray-400 hover:text-gray-600 underline">전체 해제</button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-500 mb-3">평가 기준 (각 5점, 총 20점)</h2>
            <div className="space-y-3">
              {CRITERIA.map((c) => (
                <div key={c.key}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="font-medium text-gray-800">{c.label} <span className="text-xs text-gray-400">({c.sub})</span></span>
                    <span className="text-sm font-semibold text-rose-700">{score[c.key] ?? 0}/5</span>
                  </div>
                  <div className="flex gap-1.5">
                    {SCORE_OPTIONS.map((val) => (
                      <button key={val} onClick={() => updateScoreImmediate(currentMonth, selectedClass, selectedStudent, (p) => ({ ...p, [c.key]: val }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${(score[c.key] ?? 0) === val ? "bg-rose-800 text-white" : "bg-rose-50 text-rose-400 hover:bg-rose-100"}`}>
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-4 mb-5">
            <h2 className="text-sm font-bold text-gray-500 mb-2">비고</h2>
            <textarea value={score.note || ""} onChange={(e) => updateScoreImmediate(currentMonth, selectedClass, selectedStudent, (p) => ({ ...p, note: e.target.value }))}
              placeholder="특이사항을 입력하세요 (선택)" className="w-full border border-rose-100 rounded-xl p-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-rose-200" rows={2} />
          </div>

          <div className="bg-rose-900 rounded-2xl shadow-md p-4 flex items-center justify-between">
            <div className="text-white">
              <div className="text-xs text-rose-200">총점</div>
              <div className="text-2xl font-bold">{total}<span className="text-base text-rose-200">/{MAX_TOTAL}점</span></div>
            </div>
            <button onClick={handleSave} className="flex items-center gap-2 bg-white text-rose-900 font-bold px-5 py-2.5 rounded-xl shadow-sm hover:bg-rose-50 transition-colors">
              <Save size={18} /> {savedFlash ? "저장됨!" : "저장하기"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ===================== 타이머 컴포넌트 =====================
function TimerBlock({ recordedTime, onTimeUpdate }) {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [stoppedTime, setStoppedTime] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (running) { intervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000); }
    else { clearInterval(intervalRef.current); }
    return () => clearInterval(intervalRef.current);
  }, [running]);

  function handleStart() { setSeconds(0); setStoppedTime(null); setRunning(true); }
  function handleStop() { setRunning(false); const t = formatTime(seconds); setStoppedTime(t); onTimeUpdate(t); }

  const isOver3min = seconds >= 180;
  return (
    <div className={`rounded-2xl shadow-sm border p-4 mb-4 ${isOver3min && running ? "bg-red-50 border-red-200" : "bg-white border-rose-100"}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-gray-500 flex items-center gap-1.5"><Timer size={15} /> 스피킹 타이머</h2>
        {recordedTime && <span className="text-xs bg-rose-100 text-rose-700 font-semibold px-2.5 py-1 rounded-full">저장된 기록: {recordedTime}</span>}
      </div>
      <div className="flex items-center gap-4">
        <div className={`text-4xl font-bold tabular-nums ${isOver3min && running ? "text-red-600" : "text-rose-900"}`}>{formatTime(seconds)}</div>
        <div className="flex gap-2 items-center">
          {!running ? (
            <button onClick={handleStart} className="bg-rose-800 hover:bg-rose-900 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
              {seconds === 0 ? "시작" : "다시 시작"}
            </button>
          ) : (
            <button onClick={handleStop} className="bg-rose-600 hover:bg-rose-700 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors">정지</button>
          )}
          {stoppedTime && !running && (
            <span className="text-sm text-emerald-700 font-semibold bg-emerald-50 px-3 py-1.5 rounded-xl">✓ {stoppedTime} — 저장하기 누르면 기록됩니다</span>
          )}
        </div>
        {isOver3min && running && <span className="text-xs text-red-500 font-medium">3분 초과!</span>}
      </div>
    </div>
  );
}

// ===================== 반/학생 관리 =====================
function ManageView({ classes, onBack, actions }) {
  const [newClassName, setNewClassName] = useState("");
  const [editingClass, setEditingClass] = useState(null);
  const [editClassValue, setEditClassValue] = useState("");
  const [newStudentInputs, setNewStudentInputs] = useState({});
  const [editingStudent, setEditingStudent] = useState(null);
  const [editStudentValue, setEditStudentValue] = useState("");

  const handleAddClass = () => { if (actions.addClass(newClassName)) setNewClassName(""); };
  const startEditClass = (c) => { setEditingClass(c); setEditClassValue(c); };
  const confirmEditClass = () => {
    if (actions.renameClass(editingClass, editClassValue)) { setEditingClass(null); setEditClassValue(""); }
    else if (editClassValue.trim() === editingClass) setEditingClass(null);
  };
  const handleAddStudent = (c) => { if (actions.addStudent(c, newStudentInputs[c] || "")) setNewStudentInputs((p) => ({ ...p, [c]: "" })); };
  const startEditStudent = (c, s) => { setEditingStudent({ cls: c, student: s }); setEditStudentValue(s); };
  const confirmEditStudent = () => {
    const { cls, student } = editingStudent;
    if (actions.renameStudent(cls, student, editStudentValue)) { setEditingStudent(null); setEditStudentValue(""); }
    else if (editStudentValue.trim() === student) setEditingStudent(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-amber-50 to-rose-50 p-6">
      <div className="max-w-2xl mx-auto pb-10">
        <div className="flex items-center justify-between mb-6 pt-2">
          <button onClick={onBack} className="flex items-center gap-1 text-rose-700 font-medium hover:text-rose-900"><ChevronLeft size={20} /> 뒤로</button>
          <h1 className="text-xl font-bold text-rose-900 flex items-center gap-2"><Settings size={20} /> 반/학생 관리</h1>
          <div className="w-16" />
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-4 mb-5">
          <h2 className="text-sm font-bold text-gray-500 mb-2">새 반 추가</h2>
          <div className="flex gap-2">
            <input value={newClassName} onChange={(e) => setNewClassName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddClass()} placeholder="예: 초등 6반" className="flex-1 border border-rose-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200" />
            <button onClick={handleAddClass} className="flex items-center gap-1 bg-rose-900 hover:bg-rose-800 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"><Plus size={16} /> 추가</button>
          </div>
        </div>
        <div className="space-y-4">
          {Object.entries(classes).map(([cls, students]) => (
            <div key={cls} className="bg-white rounded-2xl shadow-sm border border-rose-100 p-4">
              <div className="flex items-center justify-between mb-3">
                {editingClass === cls ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input autoFocus value={editClassValue} onChange={(e) => setEditClassValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmEditClass()} className="flex-1 border border-rose-300 rounded-lg px-2 py-1 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-rose-200" />
                    <button onClick={confirmEditClass} className="text-xs bg-rose-800 text-white px-3 py-1.5 rounded-lg font-medium">확인</button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-rose-800 font-bold text-lg"><Users size={16} /> {cls} <span className="text-xs text-gray-400 font-normal">({students.length}명)</span></div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEditClass(cls)} className="p-1.5 text-gray-400 hover:text-rose-700"><Pencil size={15} /></button>
                      <button onClick={() => { if (window.confirm(`"${cls}" 반을 삭제할까요?`)) actions.deleteClass(cls); }} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>
                    </div>
                  </>
                )}
              </div>
              <div className="space-y-1.5 mb-3">
                {students.map((student) => (
                  <div key={student} className="flex items-center justify-between bg-rose-50/60 rounded-lg px-3 py-2">
                    {editingStudent?.cls === cls && editingStudent?.student === student ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input autoFocus value={editStudentValue} onChange={(e) => setEditStudentValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmEditStudent()} className="flex-1 border border-rose-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200" />
                        <button onClick={confirmEditStudent} className="text-xs bg-rose-800 text-white px-3 py-1 rounded-lg font-medium">확인</button>
                      </div>
                    ) : (
                      <>
                        <span className="text-sm text-gray-700">{student}</span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => startEditStudent(cls, student)} className="p-1 text-gray-400 hover:text-rose-700"><Pencil size={13} /></button>
                          <button onClick={() => { if (window.confirm(`"${student}" 학생을 삭제할까요?`)) actions.deleteStudent(cls, student); }} className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={13} /></button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {students.length === 0 && <div className="text-xs text-gray-400 px-3 py-2">등록된 학생이 없어요.</div>}
              </div>
              <div className="flex gap-2">
                <input value={newStudentInputs[cls] || ""} onChange={(e) => setNewStudentInputs((p) => ({ ...p, [cls]: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && handleAddStudent(cls)} placeholder="학생 이름 입력" className="flex-1 border border-rose-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200" />
                <button onClick={() => handleAddStudent(cls)} className="flex items-center gap-1 bg-rose-100 hover:bg-rose-200 text-rose-800 font-medium px-3 py-1.5 rounded-lg text-sm transition-colors"><Plus size={14} /> 추가</button>
              </div>
            </div>
          ))}
          {Object.keys(classes).length === 0 && <div className="text-center text-gray-400 text-sm bg-white rounded-2xl p-8 border border-rose-100">등록된 반이 없어요.</div>}
        </div>
      </div>
    </div>
  );
}
