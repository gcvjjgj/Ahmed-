const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors());
app.use(express.json());

// بيانات وهمية للتجربة
let students = [];
let supportMessages = [];
let blockedStudents = [];
let transactions = [];
let notifications = [];

// ✅ تسجيل الدخول
app.post("/api/login", (req, res) => {
  const { role, name, password, code, phone } = req.body;

  if (role === "teacher" && name === "Mahmoud only" && code === "HHDV/58HR" && phone === "01050747978") {
    return res.json({ success: true, role: "teacher" });
  }

  if (role === "support" && code === "SUPPORT123") {
    return res.json({ success: true, role: "support" });
  }

  const student = students.find(s => s.name === name && s.password === password);
  if (role === "student" && student) {
    return res.json({ success: true, role: "student", data: student });
  }

  res.status(401).json({ success: false, message: "بيانات غير صحيحة" });
});

// ✅ إنشاء حساب طالب
app.post("/api/register", (req, res) => {
  const { name, studentId, parentPhone, password, grade } = req.body;
  const newStudent = {
    id: uuidv4(),
    name,
    studentId,
    parentPhone,
    password,
    grade,
    points: 0,
    balance: 0,
    blocked: false
  };
  students.push(newStudent);
  res.json({ success: true, student: newStudent });
});

// ✅ إرسال رسالة دعم
app.post("/api/support", (req, res) => {
  const { studentId, message, image } = req.body;
  const msg = {
    id: uuidv4(),
    studentId,
    message,
    image,
    reply: null,
    timestamp: Date.now()
  };
  supportMessages.push(msg);
  res.json({ success: true, message: msg });
});

// ✅ الرد على رسالة دعم
app.post("/api/support/reply", (req, res) => {
  const { messageId, reply } = req.body;
  const msg = supportMessages.find(m => m.id === messageId);
  if (msg) {
    msg.reply = reply;
    return res.json({ success: true, updated: msg });
  }
  res.status(404).json({ success: false, message: "لم يتم العثور على الرسالة" });
});

// ✅ تأكيد الدفع
app.post("/api/confirm-payment", (req, res) => {
  const { studentId, amount, image } = req.body;
  const student = students.find(s => s.id === studentId);
  if (student) {
    student.balance += amount;
    transactions.push({ id: uuidv4(), studentId, amount, image, confirmed: true });
    return res.json({ success: true, balance: student.balance });
  }
  res.status(404).json({ success: false, message: "الطالب غير موجود" });
});

// ✅ حظر طالب
app.post("/api/block-student", (req, res) => {
  const { studentId, reason } = req.body;
  const student = students.find(s => s.id === studentId);
  if (student) {
    student.blocked = true;
    blockedStudents.push({ studentId, reason });
    return res.json({ success: true });
  }
  res.status(404).json({ success: false, message: "الطالب غير موجود" });
});

// ✅ إرسال إشعار
app.post("/api/notify", (req, res) => {
  const { title, content, target } = req.body;
  const note = { id: uuidv4(), title, content, target, timestamp: Date.now() };
  notifications.push(note);
  res.json({ success: true, notification: note });
});

// ✅ استرجاع بيانات الطالب
app.get("/api/student/:id", (req, res) => {
  const student = students.find(s => s.id === req.params.id);
  if (student) return res.json({ success: true, student });
  res.status(404).json({ success: false });
});

module.exports = app;
