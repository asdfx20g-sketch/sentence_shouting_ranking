import { useState, useEffect, useRef } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import {
  Users,
  Save,
  Trophy,
  Download,
  ChevronLeft,
  Check,
  Settings,
  Plus,
  Trash2,
  Pencil,
  Cloud,
  CloudOff,
  Calendar,
} from "lucide-react";

const CRITERIA = [
  { key: "pronunciation", label: "발음", sub: "Pronunciation", max: 5 },
  { key: "fluency", label: "유창성", sub: "Fluency", max: 5 },
  { key: "confidence", label: "자신감", sub: "Confidence", max: 5 },
  { key: "accuracy", label: "암기 정확도", sub: "Accuracy", max: 5 },
];

const TOTAL_SENTENCES = 30;
const MAX_TOTAL = 20 + TOTAL_SENTENCES;
const SCORE_OPTIONS = [0, 1, 2, 3, 4, 5];

const DEFAULT_CLASSES = {
  "초등 3반": ["김민준", "이서윤", "박지호", "최하은", "정도윤"],
  "초등 4반": ["강서연", "윤지후", "임수아", "한예준", "오다인"],
  "초등 5반": ["서준우", "황아린", "조은우", "신지유", "권태양"],
};

function emptyScore() {
  return {
    pronunciation: 0,
    fluency: 0,
    confidence: 0,
    accuracy: 0,
    sentences: Array(TOTAL_SENTENCES).fill(false),
    note: "",
  };
}

function getCurrentMonthKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthKeyToLabel(key) {
  const [y, m] = key.split("-");
  return `${y}년 ${parseInt(m, 10)}월`;
}

// 반/학생 명단은 월과 무관하게 공통으로 관리 (classesMeta 문서)
const CLASSES_DOC = { collection: "shoutingMeta", doc: "classes" };
// 월별 점수는 shoutingScores/{YYYY-MM} 문서에 저장
const scoresDocRef = (monthKey) => ({ collection: "shoutingScores", doc: monthKey });

export default function App() {
  const [classes, setClasses] = useState(DEFAULT_CLASSES);
  const [scoresByMonth, setScoresByMonth] = useState({}); // { "2026-06": {...}, "2026-07": {...} }
  const [availableMonths, setAvailableMonths] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonthKey());

  const [loaded, setLoaded] = useState(false);
  const [connError, setConnError] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [view, setView] = useState("home");
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [rankingMonth, setRankingMonth] = useState(getCurrentMonthKey());

  const saveTimer = useRef(null);
  const skipNextSave = useRef(false);
  const loadedMonths = useRef(new Set());

  // ---- 반/학생 명단 최초 로드 ----
  useEffect(() => {
    (async () => {
      try {
        const ref = doc(db, CLASSES_DOC.collection, CLASSES_DOC.doc);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          if (data.classes) setClasses(data.classes);
        } else {
          await setDoc(ref, { classes: DEFAULT_CLASSES, updatedAt: Date.now() });
        }
        setConnError(false);
      } catch (e) {
        console.error("Firestore 연결 실패:", e);
        setConnError(true);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // ---- 특정 월의 점수 데이터 로드 (필요할 때마다) ----
  async function ensureMonthLoaded(monthKey) {
    if (loadedMonths.current.has(monthKey)) return;
    try {
      const { collection, doc: docName } = scoresDocRef(monthKey);
      const ref = doc(db, collection, docName);
      const snap = await getDoc(ref);
      skipNextSave.current = true;
      if (snap.exists()) {
        const data = snap.data();
        setScoresByMonth((prev) => ({ ...prev, [monthKey]: data.scores || {} }));
        setAvailableMonths((prev) => (prev.includes(monthKey) ? prev : [...prev, monthKey].sort()));
      } else {
        setScoresByMonth((prev) => ({ ...prev, [monthKey]: {} }));
      }
      loadedMonths.current.add(monthKey);
    } catch (e) {
      console.error("월별 데이터 로드 실패:", e);
      setConnError(true);
    }
  }

  // 전체 월 목록을 가져오기 위해, 메타 문서에 "사용된 월 리스트"도 같이 관리
  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        const ref = doc(db, "shoutingMeta", "monthsList");
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const months = snap.data().months || [];
          setAvailableMonths((prev) => Array.from(new Set([...prev, ...months])).sort());
          for (const m of months) {
            await ensureMonthLoaded(m);
          }
        }
        await ensureMonthLoaded(currentMonth);
      } catch (e) {
        console.error("월 목록 로드 실패:", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // ---- classes 변경시 자동 저장 ----
  useEffect(() => {
    if (!loaded) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSyncing(true);
      try {
        const ref = doc(db, CLASSES_DOC.collection, CLASSES_DOC.doc);
        await setDoc(ref, { classes, updatedAt: Date.now() });
        setConnError(false);
      } catch (e) {
        console.error("저장 실패:", e);
        setConnError(true);
      } finally {
        setSyncing(false);
      }
    }, 500);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, loaded]);

  // ---- 현재 월 점수 저장 ----
  async function saveMonthScores(monthKey, monthScores) {
    setSyncing(true);
    try {
      const { collection, doc: docName } = scoresDocRef(monthKey);
      const ref = doc(db, collection, docName);
      await setDoc(ref, { scores: monthScores, updatedAt: Date.now() });

      // 월 목록에 등록
      if (!availableMonths.includes(monthKey)) {
        const newMonths = Array.from(new Set([...availableMonths, monthKey])).sort();
        setAvailableMonths(newMonths);
        const monthsRef = doc(db, "shoutingMeta", "monthsList");
        await setDoc(monthsRef, { months: newMonths, updatedAt: Date.now() });
      }
      setConnError(false);
    } catch (e) {
      console.error("점수 저장 실패:", e);
      setConnError(true);
    } finally {
      setSyncing(false);
    }
  }

  function getScore(monthKey, cls, student) {
    return scoresByMonth?.[monthKey]?.[cls]?.[student] || emptyScore();
  }

  function updateScore(monthKey, cls, student, updater) {
    setScoresByMonth((prev) => {
      const monthScores = prev[monthKey] || {};
      const prevClassScores = monthScores[cls] || {};
      const prevScore = prevClassScores[student] || emptyScore();
      const newScore = updater(prevScore);
      const newMonthScores = {
        ...monthScores,
        [cls]: { ...prevClassScores, [student]: newScore },
      };
      const next = { ...prev, [monthKey]: newMonthScores };

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveMonthScores(monthKey, newMonthScores);
      }, 500);

      return next;
    });
  }

  function calcTotal(scoreObj) {
    const criteriaSum =
      (scoreObj.pronunciation || 0) +
      (scoreObj.fluency || 0) +
      (scoreObj.confidence || 0) +
      (scoreObj.accuracy || 0);
    const sentenceSum = (scoreObj.sentences || []).filter(Boolean).length;
    return criteriaSum + sentenceSum;
  }

  function handleSave() {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  function exportCSV(monthKey) {
    const rows = [];
    rows.push(["월", "No", "반", "이름", "발음", "유창성", "자신감", "암기정확도", "맞은문장수", "총점", "비고"]);
    let no = 1;
    const allEntries = [];
    Object.entries(classes).forEach(([cls, students]) => {
      students.forEach((student) => {
        const s = getScore(monthKey, cls, student);
        const total = calcTotal(s);
        allEntries.push({ cls, student, s, total });
      });
    });
    allEntries.sort((a, b) => b.total - a.total);
    allEntries.forEach((entry) => {
      rows.push([
        monthKeyToLabel(monthKey), no++, entry.cls, entry.student,
        entry.s.pronunciation || 0, entry.s.fluency || 0,
        entry.s.confidence || 0, entry.s.accuracy || 0,
        (entry.s.sentences || []).filter(Boolean).length,
        entry.total, entry.s.note || "",
      ]);
    });
    const csvContent = "\uFEFF" + rows.map((r) =>
      r.map((cell) => {
        const str = String(cell ?? "");
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      }).join(",")
    ).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `EiE_Shouting_랭킹_${monthKey}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function addClass(name) {
    const trimmed = name.trim();
    if (!trimmed || classes[trimmed]) return false;
    setClasses((prev) => ({ ...prev, [trimmed]: [] }));
    return true;
  }

  function renameClass(oldName, newName) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return false;
    if (classes[trimmed]) return false;
    setClasses((prev) => {
      const next = {};
      Object.entries(prev).forEach(([cls, students]) => {
        next[cls === oldName ? trimmed : cls] = students;
      });
      return next;
    });
    return true;
  }

  function deleteClass(cls) {
    setClasses((prev) => {
      const next = { ...prev };
      delete next[cls];
      return next;
    });
  }

  function addStudent(cls, name) {
    const trimmed = name.trim();
    if (!trimmed) return false;
    if ((classes[cls] || []).includes(trimmed)) return false;
    setClasses((prev) => ({ ...prev, [cls]: [...(prev[cls] || []), trimmed] }));
    return true;
  }

  function renameStudent(cls, oldName, newName) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return false;
    if ((classes[cls] || []).includes(trimmed)) return false;
    setClasses((prev) => ({
      ...prev,
      [cls]: (prev[cls] || []).map((s) => (s === oldName ? trimmed : s)),
    }));
    return true;
  }

  function deleteStudent(cls, student) {
    setClasses((prev) => ({
      ...prev,
      [cls]: (prev[cls] || []).filter((s) => s !== student),
    }));
  }

  if (!loaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-amber-50 to-rose-50 flex items-center justify-center">
        <div className="text-rose-400 text-sm">Firebase에 연결 중...</div>
      </div>
    );
  }

  const SyncBadge = () => (
    <div
      className={`fixed bottom-3 right-3 flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full shadow-sm ${
        connError ? "bg-red-100 text-red-600" : syncing ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
      }`}
    >
      {connError ? (<><CloudOff size={13} /> 연결 끊김</>) : syncing ? (<><Cloud size={13} className="animate-pulse" /> 저장 중...</>) : (<><Cloud size={13} /> 클라우드 저장됨</>)}
    </div>
  );

  // ---------- HOME ----------
  if (view === "home") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-amber-50 to-rose-50 p-6">
        <SyncBadge />
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-6 pt-6">
            <h1 className="text-3xl font-bold text-rose-900 mb-1">EiE Shouting Time</h1>
            <p className="text-rose-500 text-sm">스피킹 채점 기록창</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-rose-200 p-3 mb-5 flex items-center justify-center gap-2">
            <Calendar size={16} className="text-rose-700" />
            <span className="text-sm text-gray-500">채점 중인 시험 회차:</span>
            <select
              value={currentMonth}
              onChange={async (e) => {
                const m = e.target.value;
                setCurrentMonth(m);
                await ensureMonthLoaded(m);
              }}
              className="text-sm font-bold text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1 focus:outline-none"
            >
              {!availableMonths.includes(currentMonth) && (
                <option value={currentMonth}>{monthKeyToLabel(currentMonth)} (신규)</option>
              )}
              {availableMonths.map((m) => (
                <option key={m} value={m}>{monthKeyToLabel(m)}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 mb-6">
            <button onClick={() => { setRankingMonth(currentMonth); setView("ranking"); }} className="flex-1 flex items-center justify-center gap-2 bg-rose-900 hover:bg-rose-800 text-white font-semibold py-3 rounded-2xl shadow-md transition-colors">
              <Trophy size={20} /> 전체 랭킹 보기
            </button>
            <button onClick={() => setView("manage")} className="flex items-center justify-center gap-2 bg-white hover:bg-rose-50 text-rose-800 font-semibold py-3 px-4 rounded-2xl shadow-sm border border-rose-200 transition-colors">
              <Settings size={20} /> 반/학생 관리
            </button>
          </div>

          {Object.keys(classes).length === 0 && (
            <div className="text-center text-rose-400 text-sm bg-white rounded-2xl p-8 border border-rose-100">
              등록된 반이 없어요. "반/학생 관리"에서 반을 추가해주세요.
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            {Object.entries(classes).map(([cls, students]) => {
              const doneCount = students.filter((s) => {
                const sc = scoresByMonth?.[currentMonth]?.[cls]?.[s];
                return sc && calcTotal(sc) > 0;
              }).length;
              return (
                <button key={cls} onClick={() => { setSelectedClass(cls); setSelectedStudent(null); setView("scoring"); }} className="bg-white rounded-2xl shadow-sm hover:shadow-md p-5 text-left transition-all border border-rose-100 hover:border-rose-300">
                  <div className="flex items-center gap-2 text-rose-800 font-bold text-lg mb-1">
                    <Users size={18} /> {cls}
                  </div>
                  <div className="text-sm text-gray-500">학생 {students.length}명 · 채점완료 {doneCount}명</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ---------- MANAGE ----------
  if (view === "manage") {
    return (
      <>
        <SyncBadge />
        <ManageView classes={classes} onBack={() => setView("home")} actions={{ addClass, renameClass, deleteClass, addStudent, renameStudent, deleteStudent }} />
      </>
    );
  }

  // ---------- RANKING (월 선택 가능) ----------
  if (view === "ranking") {
    const allEntries = [];
    Object.entries(classes).forEach(([cls, students]) => {
      students.forEach((student) => {
        const s = getScore(rankingMonth, cls, student);
        const total = calcTotal(s);
        allEntries.push({ cls, student, s, total });
      });
    });
    allEntries.sort((a, b) => b.total - a.total);

    const monthOptions = Array.from(new Set([...availableMonths, currentMonth])).sort();

    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-amber-50 to-rose-50 p-6">
        <SyncBadge />
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-4 pt-2">
            <button onClick={() => setView("home")} className="flex items-center gap-1 text-rose-700 font-medium hover:text-rose-900">
              <ChevronLeft size={20} /> 뒤로
            </button>
            <h1 className="text-xl font-bold text-rose-900 flex items-center gap-2"><Trophy size={20} /> 전체 학원생 랭킹</h1>
            <button onClick={() => exportCSV(rankingMonth)} className="flex items-center gap-1 bg-rose-900 hover:bg-rose-800 text-white text-sm font-medium px-3 py-2 rounded-xl shadow-sm transition-colors">
              <Download size={16} /> 엑셀(CSV)
            </button>
          </div>

          <div className="flex items-center justify-center gap-2 mb-4">
            <Calendar size={16} className="text-rose-700" />
            <select
              value={rankingMonth}
              onChange={async (e) => {
                const m = e.target.value;
                setRankingMonth(m);
                await ensureMonthLoaded(m);
              }}
              className="text-sm font-bold text-rose-800 bg-white border border-rose-200 rounded-lg px-3 py-1.5 focus:outline-none shadow-sm"
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>{monthKeyToLabel(m)}</option>
              ))}
            </select>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-rose-900 text-white">
                  <th className="py-3 px-3 text-center w-14">순위</th>
                  <th className="py-3 px-3 text-left">이름</th>
                  <th className="py-3 px-3 text-left">반</th>
                  <th className="py-3 px-3 text-center">발음</th>
                  <th className="py-3 px-3 text-center">유창성</th>
                  <th className="py-3 px-3 text-center">자신감</th>
                  <th className="py-3 px-3 text-center">정확도</th>
                  <th className="py-3 px-3 text-center">맞은문장</th>
                  <th className="py-3 px-3 text-center">총점</th>
                </tr>
              </thead>
              <tbody>
                {allEntries.map((entry, idx) => {
                  const rank = idx + 1;
                  const isTop3 = rank <= 3;
                  return (
                    <tr key={entry.cls + entry.student} className={`border-b border-rose-50 ${isTop3 ? "bg-amber-50" : idx % 2 === 0 ? "bg-white" : "bg-rose-50/30"}`}>
                      <td className="py-2.5 px-3 text-center font-bold">
                        {rank === 1 && "🥇"}{rank === 2 && "🥈"}{rank === 3 && "🥉"}{rank > 3 && rank}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-gray-800">{entry.student}</td>
                      <td className="py-2.5 px-3 text-gray-500">{entry.cls}</td>
                      <td className="py-2.5 px-3 text-center">{entry.s.pronunciation || 0}</td>
                      <td className="py-2.5 px-3 text-center">{entry.s.fluency || 0}</td>
                      <td className="py-2.5 px-3 text-center">{entry.s.confidence || 0}</td>
                      <td className="py-2.5 px-3 text-center">{entry.s.accuracy || 0}</td>
                      <td className="py-2.5 px-3 text-center">{(entry.s.sentences || []).filter(Boolean).length}/30</td>
                      <td className="py-2.5 px-3 text-center font-bold text-rose-800">{entry.total}/{MAX_TOTAL}</td>
                    </tr>
                  );
                })}
                {allEntries.length === 0 && (
                  <tr><td colSpan={9} className="py-8 text-center text-gray-400">이 달 채점 기록이 없어요.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ---------- SCORING (student list) ----------
  if (view === "scoring" && !selectedStudent) {
    const students = classes[selectedClass] || [];
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-amber-50 to-rose-50 p-6">
        <SyncBadge />
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2 pt-2">
            <button onClick={() => setView("home")} className="flex items-center gap-1 text-rose-700 font-medium hover:text-rose-900">
              <ChevronLeft size={20} /> 뒤로
            </button>
            <h1 className="text-xl font-bold text-rose-900">{selectedClass}</h1>
            <div className="w-16" />
          </div>
          <div className="text-center text-xs text-rose-500 mb-4">
            {monthKeyToLabel(currentMonth)} 채점 중
          </div>

          <div className="space-y-2">
            {students.map((student) => {
              const s = getScore(currentMonth, selectedClass, student);
              const total = calcTotal(s);
              const isDone = total > 0;
              return (
                <button key={student} onClick={() => setSelectedStudent(student)} className="w-full flex items-center justify-between bg-white rounded-xl shadow-sm border border-rose-100 hover:border-rose-300 px-4 py-3.5 transition-all">
                  <span className="font-medium text-gray-800">{student}</span>
                  <span className={`text-sm font-semibold px-3 py-1 rounded-full ${isDone ? "bg-rose-100 text-rose-700" : "bg-gray-100 text-gray-400"}`}>
                    {isDone ? `${total}/${MAX_TOTAL}점` : "미채점"}
                  </span>
                </button>
              );
            })}
            {students.length === 0 && (
              <div className="text-center text-gray-400 text-sm bg-white rounded-xl p-6 border border-rose-100">이 반에 등록된 학생이 없어요.</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------- SCORING (single student) ----------
  if (view === "scoring" && selectedStudent) {
    const score = getScore(currentMonth, selectedClass, selectedStudent);
    const total = calcTotal(score);
    const sentenceCheckedCount = (score.sentences || []).filter(Boolean).length;
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-amber-50 to-rose-50 p-6">
        <SyncBadge />
        <div className="max-w-2xl mx-auto pb-10">
          <div className="flex items-center justify-between mb-1 pt-2">
            <button onClick={() => setSelectedStudent(null)} className="flex items-center gap-1 text-rose-700 font-medium hover:text-rose-900">
              <ChevronLeft size={20} /> {selectedClass}
            </button>
            <h1 className="text-xl font-bold text-rose-900">{selectedStudent}</h1>
            <div className="w-16 text-right"><span className="text-sm font-bold text-rose-800">{total}/{MAX_TOTAL}</span></div>
          </div>
          <div className="text-center text-xs text-rose-500 mb-4">{monthKeyToLabel(currentMonth)} 채점</div>

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
                      <button key={val} onClick={() => updateScore(currentMonth, selectedClass, selectedStudent, (prev) => ({ ...prev, [c.key]: val }))} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${(score[c.key] ?? 0) === val ? "bg-rose-800 text-white" : "bg-rose-50 text-rose-400 hover:bg-rose-100"}`}>
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-4 mb-4">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-500">맞은 문장 체크 (총 30문장)</h2>
              <span className="text-sm font-semibold text-rose-700">{sentenceCheckedCount}/30</span>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {Array.from({ length: TOTAL_SENTENCES }).map((_, i) => {
                const checked = score.sentences?.[i] || false;
                return (
                  <button key={i} onClick={() => updateScore(currentMonth, selectedClass, selectedStudent, (prev) => {
                    const newSentences = [...(prev.sentences || Array(TOTAL_SENTENCES).fill(false))];
                    newSentences[i] = !newSentences[i];
                    return { ...prev, sentences: newSentences };
                  })} className={`aspect-square rounded-lg flex items-center justify-center text-xs font-semibold border-2 transition-colors ${checked ? "bg-rose-700 border-rose-700 text-white" : "bg-white border-rose-200 text-rose-300 hover:border-rose-400"}`}>
                    {checked ? <Check size={14} /> : i + 1}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => updateScore(currentMonth, selectedClass, selectedStudent, (prev) => ({ ...prev, sentences: Array(TOTAL_SENTENCES).fill(true) }))} className="text-xs text-rose-600 hover:text-rose-800 underline">전체 체크</button>
              <button onClick={() => updateScore(currentMonth, selectedClass, selectedStudent, (prev) => ({ ...prev, sentences: Array(TOTAL_SENTENCES).fill(false) }))} className="text-xs text-gray-400 hover:text-gray-600 underline">전체 해제</button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-4 mb-5">
            <h2 className="text-sm font-bold text-gray-500 mb-2">비고</h2>
            <textarea value={score.note || ""} onChange={(e) => updateScore(currentMonth, selectedClass, selectedStudent, (prev) => ({ ...prev, note: e.target.value }))} placeholder="특이사항을 입력하세요 (선택)" className="w-full border border-rose-100 rounded-xl p-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-rose-200" rows={2} />
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

function ManageView({ classes, onBack, actions }) {
  const [newClassName, setNewClassName] = useState("");
  const [editingClass, setEditingClass] = useState(null);
  const [editClassValue, setEditClassValue] = useState("");
  const [newStudentInputs, setNewStudentInputs] = useState({});
  const [editingStudent, setEditingStudent] = useState(null);
  const [editStudentValue, setEditStudentValue] = useState("");

  function handleAddClass() {
    if (actions.addClass(newClassName)) setNewClassName("");
  }
  function startEditClass(cls) {
    setEditingClass(cls);
    setEditClassValue(cls);
  }
  function confirmEditClass() {
    if (actions.renameClass(editingClass, editClassValue)) {
      setEditingClass(null);
      setEditClassValue("");
    } else if (editClassValue.trim() === editingClass) {
      setEditingClass(null);
    }
  }
  function handleAddStudent(cls) {
    const text = newStudentInputs[cls] || "";
    if (actions.addStudent(cls, text)) setNewStudentInputs((prev) => ({ ...prev, [cls]: "" }));
  }
  function startEditStudent(cls, student) {
    setEditingStudent({ cls, student });
    setEditStudentValue(student);
  }
  function confirmEditStudent() {
    const { cls, student } = editingStudent;
    if (actions.renameStudent(cls, student, editStudentValue)) {
      setEditingStudent(null);
      setEditStudentValue("");
    } else if (editStudentValue.trim() === student) {
      setEditingStudent(null);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-amber-50 to-rose-50 p-6">
      <div className="max-w-2xl mx-auto pb-10">
        <div className="flex items-center justify-between mb-6 pt-2">
          <button onClick={onBack} className="flex items-center gap-1 text-rose-700 font-medium hover:text-rose-900">
            <ChevronLeft size={20} /> 뒤로
          </button>
          <h1 className="text-xl font-bold text-rose-900 flex items-center gap-2"><Settings size={20} /> 반/학생 관리</h1>
          <div className="w-16" />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-4 mb-5">
          <h2 className="text-sm font-bold text-gray-500 mb-2">새 반 추가</h2>
          <div className="flex gap-2">
            <input value={newClassName} onChange={(e) => setNewClassName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddClass()} placeholder="예: 초등 6반" className="flex-1 border border-rose-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200" />
            <button onClick={handleAddClass} className="flex items-center gap-1 bg-rose-900 hover:bg-rose-800 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
              <Plus size={16} /> 추가
            </button>
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
                    <div className="flex items-center gap-2 text-rose-800 font-bold text-lg">
                      <Users size={16} /> {cls} <span className="text-xs text-gray-400 font-normal">({students.length}명)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEditClass(cls)} className="p-1.5 text-gray-400 hover:text-rose-700 transition-colors" title="반 이름 수정"><Pencil size={15} /></button>
                      <button onClick={() => { if (window.confirm(`"${cls}" 반을 삭제할까요? 학생도 함께 삭제됩니다.`)) actions.deleteClass(cls); }} className="p-1.5 text-gray-400 hover:text-red-600 transition-colors" title="반 삭제"><Trash2 size={15} /></button>
                    </div>
                  </>
                )}
              </div>
              <div className="space-y-1.5 mb-3">
                {students.map((student) => (
                  <div key={student} className="flex items-center justify-between bg-rose-50/60 rounded-lg px-3 py-2">
                    {editingStudent && editingStudent.cls === cls && editingStudent.student === student ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input autoFocus value={editStudentValue} onChange={(e) => setEditStudentValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmEditStudent()} className="flex-1 border border-rose-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200" />
                        <button onClick={confirmEditStudent} className="text-xs bg-rose-800 text-white px-3 py-1 rounded-lg font-medium">확인</button>
                      </div>
                    ) : (
                      <>
                        <span className="text-sm text-gray-700">{student}</span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => startEditStudent(cls, student)} className="p-1 text-gray-400 hover:text-rose-700 transition-colors"><Pencil size={13} /></button>
                          <button onClick={() => { if (window.confirm(`"${student}" 학생을 삭제할까요?`)) actions.deleteStudent(cls, student); }} className="p-1 text-gray-400 hover:text-red-600 transition-colors"><Trash2 size={13} /></button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {students.length === 0 && (<div className="text-xs text-gray-400 px-3 py-2">등록된 학생이 없어요.</div>)}
              </div>
              <div className="flex gap-2">
                <input value={newStudentInputs[cls] || ""} onChange={(e) => setNewStudentInputs((prev) => ({ ...prev, [cls]: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && handleAddStudent(cls)} placeholder="학생 이름 입력" className="flex-1 border border-rose-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200" />
                <button onClick={() => handleAddStudent(cls)} className="flex items-center gap-1 bg-rose-100 hover:bg-rose-200 text-rose-800 font-medium px-3 py-1.5 rounded-lg text-sm transition-colors">
                  <Plus size={14} /> 추가
                </button>
              </div>
            </div>
          ))}
          {Object.keys(classes).length === 0 && (
            <div className="text-center text-gray-400 text-sm bg-white rounded-2xl p-8 border border-rose-100">등록된 반이 없어요. 위에서 반을 추가해주세요.</div>
          )}
        </div>
      </div>
    </div>
  );
}
