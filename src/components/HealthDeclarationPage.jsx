import { useState, useRef, useEffect, useCallback } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Button, Field, Input } from "./ui/ds/index.js";
import "../styles/health-declaration.css";

const LOGO_SRC = "/stream-line-logo.jpeg";
const LOGO_FALLBACK = "/logo.png";

const ANSWER_KEYS = [
  "q1", "q2a", "q2b", "q2c", "q3a", "q3b", "q4a", "q4b",
  "q5a", "q5b", "q6", "q7", "q8",
];

function blankAnswers() {
  return Object.fromEntries(ANSWER_KEYS.map((k) => [k, null]));
}

function YesNo({ value, onChange, disabled }) {
  return (
    <div className="hd-yesno" role="radiogroup">
      <button
        type="button"
        className={`hd-yesno-btn ${value === "yes" ? "selected-yes" : ""}`}
        onClick={() => onChange("yes")}
        disabled={disabled}
        aria-pressed={value === "yes"}
      >
        כן
      </button>
      <button
        type="button"
        className={`hd-yesno-btn ${value === "no" ? "selected-no" : ""}`}
        onClick={() => onChange("no")}
        disabled={disabled}
        aria-pressed={value === "no"}
      >
        לא
      </button>
    </div>
  );
}

function Question({ text, answerKey, answers, setAnswers, disabled, sub }) {
  return (
    <div className={sub ? "hd-sub-question" : "hd-question"}>
      <p className="hd-question-text">{text}</p>
      <YesNo
        value={answers[answerKey]}
        onChange={(v) => setAnswers((a) => ({ ...a, [answerKey]: v }))}
        disabled={disabled}
      />
    </div>
  );
}

function SignaturePad({ canvasRef, onDraw, disabled }) {
  const drawing = useRef(false);
  const onDrawRef = useRef(onDraw);
  onDrawRef.current = onDraw;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || disabled) return;

    const setupCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = "#012A4A";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    };

    setupCanvas();
    const ro = new ResizeObserver(setupCanvas);
    ro.observe(canvas);

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const endStroke = () => {
      drawing.current = false;
    };

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      drawing.current = true;
      const ctx = canvas.getContext("2d");
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      ctx.beginPath();
      ctx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
    };

    const onTouchMove = (e) => {
      if (!drawing.current || e.touches.length !== 1) return;
      e.preventDefault();
      const ctx = canvas.getContext("2d");
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      ctx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
      ctx.stroke();
      onDrawRef.current?.();
    };

    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      drawing.current = true;
      const ctx = canvas.getContext("2d");
      const { x, y } = getPos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    };

    const onMouseMove = (e) => {
      if (!drawing.current) return;
      e.preventDefault();
      const ctx = canvas.getContext("2d");
      const { x, y } = getPos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
      onDrawRef.current?.();
    };

    const useTouch = "ontouchstart" in window;

    if (useTouch) {
      canvas.addEventListener("touchstart", onTouchStart, { passive: false });
      canvas.addEventListener("touchmove", onTouchMove, { passive: false });
      canvas.addEventListener("touchend", endStroke);
      canvas.addEventListener("touchcancel", endStroke);
    } else {
      canvas.addEventListener("mousedown", onMouseDown);
      canvas.addEventListener("mousemove", onMouseMove);
      canvas.addEventListener("mouseup", endStroke);
      canvas.addEventListener("mouseleave", endStroke);
    }

    return () => {
      ro.disconnect();
      drawing.current = false;
      if (useTouch) {
        canvas.removeEventListener("touchstart", onTouchStart);
        canvas.removeEventListener("touchmove", onTouchMove);
        canvas.removeEventListener("touchend", endStroke);
        canvas.removeEventListener("touchcancel", endStroke);
      } else {
        canvas.removeEventListener("mousedown", onMouseDown);
        canvas.removeEventListener("mousemove", onMouseMove);
        canvas.removeEventListener("mouseup", endStroke);
        canvas.removeEventListener("mouseleave", endStroke);
      }
    };
  }, [canvasRef, disabled]);

  return (
    <canvas
      ref={canvasRef}
      className="hd-signature-canvas"
      style={disabled ? { opacity: 0.5, pointerEvents: "none" } : undefined}
    />
  );
}

export default function HealthDeclarationPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [age, setAge] = useState("");
  const [answers, setAnswers] = useState(blankAnswers);
  const [agreed, setAgreed] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const canvasRef = useRef(null);

  const anyYes = ANSWER_KEYS.some((k) => answers[k] === "yes");
  const allAnswered = ANSWER_KEYS.every((k) => answers[k] !== null);
  const canSign = allAnswered && !anyYes;

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const todayStr = useCallback(() => {
    return new Date().toLocaleDateString("he-IL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, []);

  const displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    if (!firstName.trim()) {
      setError("נא למלא שם פרטי");
      return;
    }
    if (!lastName.trim()) {
      setError("נא למלא שם משפחה");
      return;
    }
    if (!idNumber.trim()) {
      setError("נא למלא מספר תעודת זהות");
      return;
    }
    if (!age.trim() || Number(age) < 1 || Number(age) > 120) {
      setError("נא למלא גיל תקין");
      return;
    }
    if (!allAnswered) {
      setError("נא לענות על כל השאלות בשאלון הרפואי");
      return;
    }
    if (anyYes) {
      setError("ענית «כן» לאחת השאלות — נדרש אישור רופא לפני חתימה על ההצהרה");
      return;
    }
    if (!agreed) {
      setError("נא לאשר את נוסח ההצהרה");
      return;
    }
    if (!hasSignature) {
      setError("נא לחתום בשדה החתימה");
      return;
    }

    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (submitted) {
    return (
      <div className="health-declaration" dir="rtl">
        <div className="hd-shell">
          <div className="hd-success">
            <div className="hd-success-icon" aria-hidden>
              <CheckCircle2 size={36} strokeWidth={1.75} />
            </div>
            <h2>ההצהרה נחתמה בהצלחה</h2>
            <p>
              <strong>{displayName}</strong>
              <br />
              תעודת זהות: {idNumber} · גיל: {age}
              <br />
              תאריך: {todayStr()}
              <br /><br />
              זוהי הדגמה של טופס דיגיטלי — הנתונים לא נשמרו במערכת.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="health-declaration" dir="rtl">
      <form className="hd-shell" onSubmit={handleSubmit} noValidate>
        <header className="hd-header">
          <img
            src={LOGO_SRC}
            alt="Stream Line"
            onError={(e) => { e.target.onerror = null; e.target.src = LOGO_FALLBACK; }}
          />
          <h1 className="hd-title">
            תוספת (תקנה 2) — טופס הצהרת בריאות למבקש להתאמן בחדר כושר
          </h1>
          <p className="hd-subtitle">טופס דיגיטלי · הדגמה</p>
          <span className="hd-demo-badge">דמו — ללא שמירה במערכת</span>
        </header>

        <section className="hd-section" aria-labelledby="hd-personal">
          <h2 id="hd-personal" className="hd-section-title">פרטים אישיים</h2>
          <p className="hd-gender-note">
            השאלון נוסח בלשון זכר מטעמי נוחות, והוא מתייחס לשני המינים.
          </p>
          <div className="hd-personal-grid">
            <Field label="שם פרטי" required>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="שם פרטי"
                dir="rtl"
                autoComplete="given-name"
              />
            </Field>
            <Field label="שם משפחה" required>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="שם משפחה"
                dir="rtl"
                autoComplete="family-name"
              />
            </Field>
            <Field label="מספר תעודת זהות" required>
              <Input
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 9))}
                placeholder="000000000"
                dir="ltr"
                inputMode="numeric"
                autoComplete="off"
              />
            </Field>
            <Field label="גיל" required>
              <Input
                value={age}
                onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))}
                placeholder="25"
                dir="ltr"
                inputMode="numeric"
              />
            </Field>
          </div>
        </section>

        <section className="hd-section" aria-labelledby="hd-part-a">
          <h2 id="hd-part-a" className="hd-section-title">חלק א׳: שאלון רפואי</h2>

          <Question
            text="1. האם הרופא שלך אמר לך שאתה סובל ממחלת לב?"
            answerKey="q1"
            answers={answers}
            setAnswers={setAnswers}
          />

          <div className="hd-question">
            <p className="hd-question-text">2. האם אתה חש כאבים בחזה (סמן לכל סעיף):</p>
            <Question sub text="(א) במנוחה?" answerKey="q2a" answers={answers} setAnswers={setAnswers} />
            <Question sub text="(ב) בפעילות שגרתית יומיומית?" answerKey="q2b" answers={answers} setAnswers={setAnswers} />
            <Question sub text="(ג) בעת ביצוע פעילות גופנית?" answerKey="q2c" answers={answers} setAnswers={setAnswers} />
          </div>

          <div className="hd-question">
            <p className="hd-question-text">3. במהלך השנה האחרונה (סמן לכל סעיף):</p>
            <Question
              sub
              text="(א) האם איבדת שיווי משקל עקב סחרחורת? (סמן «לא» אם הסחרחורת נגרמה מהיפרוונטילציה)"
              answerKey="q3a"
              answers={answers}
              setAnswers={setAnswers}
            />
            <Question sub text="(ב) האם איבדת הכרה?" answerKey="q3b" answers={answers} setAnswers={setAnswers} />
          </div>

          <div className="hd-question">
            <p className="hd-question-text">4. האם אובחנת כחולה אסתמה ובשלושת החודשים האחרונים (סמן לכל סעיף):</p>
            <Question sub text="(א) נזקקת לטיפול תרופתי?" answerKey="q4a" answers={answers} setAnswers={setAnswers} />
            <Question sub text="(ב) סבלת מקוצר נשימה או מצפצופים?" answerKey="q4b" answers={answers} setAnswers={setAnswers} />
          </div>

          <div className="hd-question">
            <p className="hd-question-text">5. האם בן משפחה מדרגה ראשונה נפטר (סמן לכל סעיף):</p>
            <Question sub text="(א) ממחלת לב?" answerKey="q5a" answers={answers} setAnswers={setAnswers} />
            <Question
              sub
              text="(ב) ממוות פתאומי בגיל צעיר (לפני גיל 55 לגברים, לפני גיל 65 לנשים)?"
              answerKey="q5b"
              answers={answers}
              setAnswers={setAnswers}
            />
          </div>

          <Question
            text="6. האם הרופא אמר לך בחמש השנים האחרונות שעליך להתאמן רק בהשגחה רפואית?"
            answerKey="q6"
            answers={answers}
            setAnswers={setAnswers}
          />

          <Question
            text="7. האם אתה סובל ממחלה כרונית אחרת שלא הוזכרה לעיל, שעלולה להגביל פעילות גופנית?"
            answerKey="q7"
            answers={answers}
            setAnswers={setAnswers}
          />

          <Question
            text="8. לנשים בהריון: האם ההריון הנוכחי או הריון קודם הוגדרו כהריון בסיכון?"
            answerKey="q8"
            answers={answers}
            setAnswers={setAnswers}
          />
        </section>

        <section className="hd-section" aria-labelledby="hd-part-b">
          <h2 id="hd-part-b" className="hd-section-title">חלק ב׳: הנחיות</h2>
          <div className="hd-info-box">
            <ol>
              <li>אם נענתה תשובה «כן» לאחת מהשאלות — נדרש אישור רפואי מרופא לפני תחילת האימון.</li>
              <li>אם נענתה «לא» לכל השאלות — ניתן לחתום על ההצהרה.</li>
              <li>אם מצבך הרפואי משתנה — יש להתייעץ עם רופא.</li>
            </ol>
          </div>
        </section>

        {anyYes && allAnswered && (
          <div className="hd-warning" role="alert">
            <AlertTriangle size={20} className="hd-warning-icon" aria-hidden />
            <div>
              <strong>נדרש אישור רופא</strong>
              <br />
              ענית «כן» לאחת או יותר מהשאלות. לפי ההנחיות, יש להמציא אישור רפואי לפני חתימה על ההצהרה.
            </div>
          </div>
        )}

        <section className="hd-section" aria-labelledby="hd-part-c">
          <h2 id="hd-part-c" className="hd-section-title">חלק ג׳: הצהרה</h2>
          <p className="hd-declaration-text">
            אני מצהיר/ה בזאת כי קראתי והבנתי את השאלון הרפואי, מסרתי מידע אמיתי ומלא,
            ואני מודע/ת לכך שנדרשת הצהרה חדשה אחת לשנתיים.
          </p>

          <label className="hd-checkbox-row">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              disabled={!canSign}
            />
            <span>אני מאשר/ת שקראתי את השאלון וההנחיות, ומסרתי מידע אמיתי ומלא</span>
          </label>

          <div className="hd-personal-grid" style={{ marginBottom: 16 }}>
            <Field label="שם פרטי (לחתימה)">
              <Input value={firstName} readOnly dir="rtl" style={{ background: "var(--surface-sunk)" }} />
            </Field>
            <Field label="שם משפחה (לחתימה)">
              <Input value={lastName} readOnly dir="rtl" style={{ background: "var(--surface-sunk)" }} />
            </Field>
            <Field label="תאריך">
              <Input value={todayStr()} readOnly dir="ltr" style={{ background: "var(--surface-sunk)" }} />
            </Field>
          </div>

          <div className="hd-signature-wrap">
            <span className="hd-signature-label">חתימה {!canSign ? "(זמין לאחר מענה «לא» לכל השאלות)" : "*"}</span>
            <SignaturePad
              canvasRef={canvasRef}
              onDraw={() => setHasSignature(true)}
              disabled={!canSign}
            />
            <div className="hd-signature-actions">
              <Button type="button" variant="secondary" size="sm" onClick={clearSignature} disabled={!canSign}>
                נקה חתימה
              </Button>
            </div>
          </div>
        </section>

        <footer className="hd-footer-note">
          פעילות גופנית סדירה תורמת לבריאות הלב, לשליטה במשקל ולרווחה כללית.
          מומלץ לאנשים מעל גיל 45 לקבל הדרכה מקצועית ולהתחיל בפעילות הדרגתית.
        </footer>

        {error && <div className="hd-error" role="alert">{error}</div>}

        <div className="hd-actions">
          <Button type="submit" variant="primary" fullWidth disabled={!canSign}>
            שליחת ההצהרה
          </Button>
        </div>
      </form>
    </div>
  );
}
