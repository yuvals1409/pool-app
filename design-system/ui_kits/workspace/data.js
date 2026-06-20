// Stream Line — UI kit mock data (window globals, no exports)
window.SL_DATA = (function () {
  const instructors = [
    { id: "i1", name: "Maya Levi",   color: "var(--instr-1)" },
    { id: "i2", name: "Dana Bar",    color: "var(--instr-2)" },
    { id: "i3", name: "Omer Katz",   color: "var(--instr-3)" },
    { id: "i4", name: "Noa Shaul",   color: "var(--instr-4)" },
  ];

  // week grid: hours 14–19, lessons keyed by day index (0=Sun)
  const lessons = [
    { day: 0, start: "15:00", dur: 30, child: "Yoav Cohen",   instr: "i1" },
    { day: 0, start: "16:30", dur: 30, child: "Lia Mor",      instr: "i2" },
    { day: 1, start: "14:30", dur: 30, child: "Adam Peretz",  instr: "i3" },
    { day: 1, start: "16:00", dur: 60, child: "Group · Dolphins", instr: "i1", group: true },
    { day: 1, start: "17:30", dur: 30, child: "Tamar Gal",    instr: "i4" },
    { day: 2, start: "15:30", dur: 30, child: "Eitan Bar",    instr: "i2" },
    { day: 2, start: "17:00", dur: 30, child: "Shira Dov",    instr: "i3" },
    { day: 3, start: "14:00", dur: 60, child: "Group · Turtles", instr: "i4", group: true },
    { day: 3, start: "16:30", dur: 30, child: "Roni Avraham", instr: "i1" },
    { day: 4, start: "15:00", dur: 30, child: "Maya Stern",   instr: "i2" },
    { day: 4, start: "16:00", dur: 30, child: "Gil Shemesh",  instr: "i3" },
    { day: 4, start: "17:30", dur: 30, child: "Noam Levi",    instr: "i1" },
    { day: 5, start: "09:30", dur: 60, child: "Group · Sharks",   instr: "i2", group: true },
    { day: 5, start: "11:00", dur: 30, child: "Daniel Tov",   instr: "i4" },
  ];

  const enrollments = [
    { child: "Yoav Cohen",   parent: "Tal Cohen",    phone: "054-812-3390", product: "Private · Mon 16:30", instr: "Maya Levi", pay: "paid",   used: 6, total: 8 },
    { child: "Lia Mor",      parent: "Roni Mor",     phone: "052-447-1185", product: "Private · Sun 16:30", instr: "Dana Bar",  pay: "unpaid", used: 2, total: 8 },
    { child: "Adam Peretz",  parent: "Sivan Peretz", phone: "050-339-7741", product: "Group · Dolphins",    instr: "Omer Katz", pay: "paid",   used: 5, total: 12 },
    { child: "Tamar Gal",    parent: "Yael Gal",     phone: "053-998-2204", product: "Private · Mon 17:30", instr: "Noa Shaul", pay: "waived", used: 8, total: 8 },
    { child: "Eitan Bar",    parent: "Dana Bar",     phone: "054-110-6628", product: "Private · Tue 15:30", instr: "Dana Bar",  pay: "paid",   used: 3, total: 8 },
    { child: "Shira Dov",    parent: "Liat Dov",     phone: "052-771-0093", product: "Group · Turtles",     instr: "Omer Katz", pay: "unpaid", used: 1, total: 12 },
    { child: "Roni Avraham", parent: "Ido Avraham",  phone: "050-664-8810", product: "Private · Wed 16:30", instr: "Maya Levi", pay: "paid",   used: 7, total: 8 },
    { child: "Maya Stern",   parent: "Gad Stern",    phone: "053-221-5567", product: "Private · Thu 15:00", instr: "Dana Bar",  pay: "paid",   used: 4, total: 8 },
  ];

  const weekly = [62, 71, 68, 80, 74, 88, 92]; // attendance %
  const products = [
    { name: "Private lessons", value: 168, color: "var(--instr-1)" },
    { name: "Group · Dolphins", value: 44, color: "var(--instr-2)" },
    { name: "Group · Turtles",  value: 38, color: "var(--instr-3)" },
    { name: "Summer course",    value: 34, color: "var(--instr-4)" },
  ];

  return { instructors, lessons, enrollments, weekly, products,
    hours: ["09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00"],
    days: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"] };
})();
