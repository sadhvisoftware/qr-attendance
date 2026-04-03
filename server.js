const express = require("express");
const path = require("path");
const db = require("./db");
const cors = require("cors");

const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname,"public")));

const PORT = process.env.PORT || 5000;

app.listen(PORT,"0.0.0.0",()=>{
console.log("Server running 🚀");
});

app.get("/",(req,res)=>{
res.send("Server Working");
});


/* ---------------- TIME FUNCTIONS ---------------- */

function timeDiff(start,end){

const startTime=new Date(`1970-01-01T${start}`);
const endTime=new Date(`1970-01-01T${end}`);

let diff=endTime-startTime;

if(diff<0) diff=0;

let totalMinutes=Math.floor(diff/60000)

let h=Math.floor(totalMinutes/60);
let m=totalMinutes%60;

return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

function toMinutes(time){
const [h,m] = time.split(":").map(Number);
return h*60+m;
}

function toHHMM(min){
let h=Math.floor(min/60);
let m=min%60;
return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

function calcWorking(total,breakTime){

let totalMin=toMinutes(total);
let breakMin=toMinutes(breakTime);

let working=totalMin-breakMin;

if(working<0) working=0;

return toHHMM(working);

}

/* ---------------- OFFICE TIMES ---------------- */

const officeStart = "10:15:00";
const lateLimit = "12:30:00";
const halfDayLimit = "14:00:00";

const lunchStart = "13:00:00";
const lunchEnd = "15:00:00";
const officeEnd = "19:15:00";


/* ---------------- LOGIN ---------------- */

const bcrypt = require("bcrypt");

app.post("/login",(req,res)=>{

const {email,password}=req.body;

/* 1️⃣ Check email */
const sql="SELECT * FROM employees WHERE email=?";

db.query(sql,[email],(err,result)=>{

if(err) return res.status(500).send("DB error");

/* ❌ Email not found */
if(result.length===0){
return res.json({error:"Email not registered"});
}

const user=result[0];

/* 🔥 COMPARE HASHED PASSWORD */
bcrypt.compare(password, user.password, (err, isMatch) => {

if(err) return res.status(500).send("Error");

/* ❌ Wrong password */
if(!isMatch){
return res.json({error:"Incorrect password"});
}

/* ✅ Success */
res.json({
employee_id:user.id,
name:user.NAME,
department:user.department,
role:user.role
});

});

});

});

app.post("/mark-attendance",(req,res)=>{

const {employee_id,type,remark} = req.body;



const now = new Date();
const ist = new Date(now.toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));

const today = ist.toISOString().split("T")[0];
const currentTime = ist.toTimeString().split(" ")[0];


db.query(
"SELECT * FROM attendance WHERE employee_id=? AND DATE=?",
[employee_id,today],
(err,results)=>{

if(err) return res.status(500).send("DB Error");


/* ---------------- HELPER FUNCTIONS ---------------- */

function addTime(t1,t2){
  const [h1,m1] = t1.split(":").map(Number);
  const [h2,m2] = t2.split(":").map(Number);

  let total = (h1*60+m1) + (h2*60+m2);

  let h = Math.floor(total/60);
  let m = total%60;

  return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");
}


/* ---------------- IN TIME ---------------- */

if(type==="IN"){

if(results.length>0){
return res.send("IN already marked");
}

let permissionType=null;
let permissionTime=null;
let status="Present";

/* 🔥 UPDATED TIME → 10:15 */

if(currentTime <= "10:15:00"){
  status="Present";
}
else if(currentTime <= "10:45:00"){
  status="Present";   // late only
}
else if(currentTime <= "12:30:00"){
  status="Permission";
  permissionType="Permission";

  // 🔥 base 30 min (10:15 → 10:45)
  const basePermission = 30;

  // extra after 10:45
  const extraMin = Math.floor(
    (new Date(`1970-01-01T${currentTime}`) -
     new Date(`1970-01-01T10:45:00`)) / 60000
  );

  const totalMin = basePermission + (extraMin > 0 ? extraMin : 0);

  permissionTime = toHHMM(totalMin);
}
else{
  status="Half Day";
  permissionType=null;
}

db.query(
`INSERT INTO attendance
(employee_id,DATE,in_time,permission_type,permission_time,attendance_status)
VALUES (?,?,?,?,?,?)`,
[
employee_id,
today,
currentTime,
permissionType,
permissionTime,
status
],
(err)=>{
if(err){
console.log(err);
return res.status(500).send("DB Error");
}
res.send("IN Time Marked");
}
);

return;
}


/* ---------------- LUNCH START ---------------- */

if(type==="LUNCH_OUT"){

if(results.length===0){
return res.send("Mark IN first");
}

const r=results[0];

if(r.lunch_out){
return res.send("Lunch already started");
}

db.query(
"UPDATE attendance SET lunch_out=? WHERE id=?",
[currentTime,r.id],
()=>res.send("Lunch Start Marked")
);

return;
}


/* ---------------- LUNCH END ---------------- */

if(type==="LUNCH_IN"){

if(results.length===0){
return res.send("Mark IN first");
}

const r=results[0];

if(!r.lunch_out){
return res.send("Lunch start not marked");
}

if(r.lunch_in){
return res.send("Lunch already ended");
}

let breakTime=timeDiff(r.lunch_out,currentTime);

db.query(
`UPDATE attendance
SET lunch_in=?, break_time=?
WHERE id=?`,
[currentTime,breakTime,r.id],
()=>res.send("Lunch End Marked")
);

return;
}

/* ---------------- OUT TIME ---------------- */

if(type==="OUT"){

if(results.length===0){
return res.send("Mark IN first");
}

const r=results[0];

if(r.out_time){
return res.send("OUT already marked");
}

let totalHours=timeDiff(r.in_time,currentTime);

let breakTime="00:00";

if(r.lunch_out && r.lunch_in){
breakTime=timeDiff(r.lunch_out,r.lunch_in);
}

let workingHours = calcWorking(totalHours, breakTime);

/* 🔥 SUBTRACT PERMISSION */
// 🔥 REQUIRED WORKING TIME
const requiredMin = 8 * 60;

let workingMin = toMinutes(workingHours);

let permissionTime = "00:00";
let status = "Full Day";
let permissionType = null;

// 🔥 AUTO PERMISSION
if(workingMin < requiredMin){

  const diffMin = requiredMin - workingMin;

  permissionTime = toHHMM(diffMin > 0 ? diffMin : 0);

  status = "Permission";
  permissionType = "Permission";

}
else{

  // 🔥 KEEP PREVIOUS RULES (half day etc.)
  if(r.attendance_status === "Half Day"){
    status = "Half Day";
  } else {
    status = "Full Day";
  }

}

db.query(
`UPDATE attendance
SET 
out_time=?,
total_hours=?,
working_hours=?,
permission_time=?,
attendance_status=?,
permission_type=?
WHERE id=?`,
[
 currentTime,
  totalHours,
  workingHours,
  permissionTime,
  status,
  permissionType,
  r.id
],
()=>res.send("OUT Time Marked")
);

return;
}

});
});

/* ---------------- ADMIN ATTENDANCE ---------------- */

app.get("/admin/attendance",(req,res)=>{

let date=req.query.date;

if(!date){
date=new Date().toISOString().split("T")[0];
}

const sql=`
SELECT 
e.id as employee_id,
e.NAME as name,
e.department,
a.DATE,
a.in_time,
a.lunch_out,
a.lunch_in,
a.out_time,
a.total_hours,
a.working_hours,
a.permission_type,
a.permission_time,
a.attendance_status,
a.remark,
h.reason as holiday_reason
FROM employees e
LEFT JOIN attendance a
ON e.id=a.employee_id AND a.DATE=?
LEFT JOIN holidays h
ON h.holiday_date=?
WHERE e.role='employee'
ORDER BY e.NAME ASC
`;

db.query(sql,[date,date],(err,results)=>{

if(err) return res.status(500).send("DB Error");

const data = results.map(r=>{

let status="Absent";

/* Holiday */

if(r.holiday_reason){
  status = "Holiday";
}
else if(r.attendance_status){
  status = r.attendance_status;
}
else if(r.in_time && !r.out_time){
  status = "Present";
}

return{
...r,
status
};

});

res.json(data);

});

});


/* ---------------- ADMIN STATS ---------------- */

app.get("/admin/stats",(req,res)=>{

const today=new Date().toISOString().split("T")[0];

db.query(
"SELECT COUNT(*) as total FROM employees WHERE role='employee'",
(err,total)=>{

db.query(
`SELECT COUNT(DISTINCT a.employee_id) as present
 FROM attendance a
 JOIN employees e ON a.employee_id = e.id
 WHERE a.DATE=? AND e.role='employee'`,
[today],
(err,present)=>{

res.json({
total:total[0].total,
present:present[0].present,
absent:total[0].total - present[0].present
});

});

});

});


/* ---------------- LIVE STATUS ---------------- */

app.get("/admin/live-status",(req,res)=>{

const today = new Date().toISOString().split("T")[0];

const sql = `
SELECT 
e.id,
e.NAME,
e.department,
a.in_time,
a.lunch_out,
a.lunch_in,
a.out_time,
a.permission_type
FROM employees e
LEFT JOIN attendance a
ON e.id = a.employee_id AND a.DATE = ?
WHERE e.role='employee'
ORDER BY e.NAME ASC
`;

db.query(sql,[today],(err,results)=>{

if(err) return res.status(500).send("DB Error");

let data = results.map(r=>{

let status="Absent";

/* STATUS LOGIC (same) */
if(r.permission_type==="Half Day"){

  if(r.in_time && !r.out_time){
    status="Half Day Working";
  }
  else if(r.out_time){
    status="OUT";
  }

}
else{

  if(r.out_time){
    status="OUT";
  }
  else if(r.in_time && !r.lunch_out){
    status="IN";
  }
  else if(r.lunch_out && !r.lunch_in){
    status="Lunch Break";
  }
  else if(r.lunch_in && !r.out_time){
    status="Working";
  }

}

/* 🔥 RETURN CLEAN DATA */
return {
  id: r.id,
  name: r.NAME,
  department: r.department,
  status,

  in_time: r.in_time,
  lunch_start: r.lunch_out,
  lunch_end: r.lunch_in,
  out_time: r.out_time
};

});

res.json(data);

});

});


/* ---------------- EMPLOYEE STATUS ---------------- */

app.get("/employee/status", (req, res) => {
  const employee_id = req.query.employee_id;
  const today = new Date().toISOString().split("T")[0];

  db.query(
    "SELECT * FROM attendance WHERE employee_id=? AND DATE=?",
    [employee_id, today],
    (err, results) => {
      if (err) return res.status(500).send("DB Error");

      if (results.length === 0) {
        return res.json({
          status: "NOT MARKED",
          last_scan_type: null,
          last_scan_time: null
        });
      }

      const r = results[0];

      let status = "NOT MARKED";
      let last_scan_type = null;
      let last_scan_time = null;

      if (r.out_time) {
        status = "OUT";
        last_scan_type = "OUT TIME";
        last_scan_time = r.out_time;
      }
      else if (r.lunch_in) {
        status = "WORKING";
        last_scan_type = "LUNCH END";
        last_scan_time = r.lunch_in;
      }
      else if (r.lunch_out) {
        status = "LUNCH BREAK";
        last_scan_type = "LUNCH START";
        last_scan_time = r.lunch_out;
      }
      else if (r.in_time) {
        status = "IN";
        last_scan_type = "IN TIME";
        last_scan_time = r.in_time;
      }

      if (r.permission_type === "Permission" && r.out_time) {
        status = "PERMISSION";
        last_scan_type = "AFTERNOON PERMISSION";
        last_scan_time = r.out_time;
      }

      res.json({
        status,
        last_scan_type,
        last_scan_time,
        in_time: r.in_time,
        lunch_out: r.lunch_out,
        lunch_in: r.lunch_in,
        out_time: r.out_time,
        working_hours: r.working_hours,
        permission_type: r.permission_type,
      });
    }
  );
});


/* ---------------- ADD EMPLOYEE ---------------- */


app.post("/admin/add-employee",(req,res)=>{

const {name,email,password,department}=req.body;

/* 🔒 HASH PASSWORD */
bcrypt.hash(password, 10, (err, hash) => {

if(err){
  console.log(err);
  return res.status(500).send("Hash Error");
}

db.query(
"INSERT INTO employees(NAME,department,email,password,role) VALUES(?,?,?,?,?)",
[name,department,email,hash,"employee"],

(err)=>{

if(err){
console.log(err);
return res.status(500).send("DB Error");
}

res.send("Employee Added");

});

});

});

/* ---------------- ADD HOLIDAY ---------------- */
app.post("/admin/add-holiday",(req,res)=>{

const {date,reason}=req.body;

db.query(
"INSERT INTO holidays(holiday_date,reason) VALUES(?,?)",
[date,reason],
()=>res.send("Holiday Added")
);

});



/* ---------------- ATTENDANCE REPORT ---------------- */
const ExcelJS = require("exceljs");

app.get("/admin/report", async (req, res) => {

  const { start, end } = req.query;

  /* ---------- TIME FORMAT (AM/PM) ---------- */
  function formatTime12hr(time) {
    if (!time || time === "-") return "-";

    let [h, m] = time.split(":");
    h = parseInt(h);

    let ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;

    return `${h}:${m} ${ampm}`;
  }

  /* ---------- DURATION FORMAT ---------- */
  function formatDuration(time){
    if(!time || time === "-") return "-";

    const [h,m] = time.split(":").map(Number);

    if(h === 0) return `${m} min`;
    if(m === 0) return `${h} hr${h !== 1 ? "s" : ""}`;

    return `${h} hr${h !== 1 ? "s" : ""} ${m} min`;
  }

  const sql = `
  WITH RECURSIVE dates AS (
    SELECT DATE(?) AS date
    UNION ALL
    SELECT DATE_ADD(date, INTERVAL 1 DAY)
    FROM dates
    WHERE date < DATE(?)
  )

  SELECT 
    e.id,
    e.NAME,
    e.department,
    d.date AS DATE,
    a.in_time,
    a.lunch_out,
    a.lunch_in,
    a.out_time,
    a.permission_time,
    a.total_hours,
    a.working_hours,
    a.attendance_status,
    a.remark,
    h.reason AS holiday_reason

  FROM employees e
  CROSS JOIN dates d
  

  LEFT JOIN attendance a
    ON e.id = a.employee_id
    AND a.DATE = d.date

  LEFT JOIN holidays h
    ON h.holiday_date = d.date

WHERE e.role = 'employee'

  ORDER BY e.NAME, d.date
  `;

  db.query(sql, [start, end], async (err, rows) => {

    if (err) return res.status(500).send("DB Error");

    const workbook = new ExcelJS.Workbook();
    const employeeMap = {};

    rows.forEach(r => {
      if (!employeeMap[r.id]) {
        employeeMap[r.id] = {
          name: r.NAME,
          department: r.department,
          data: []
        };
      }
      employeeMap[r.id].data.push(r);
    });

    Object.keys(employeeMap).forEach(empId => {

      const emp = employeeMap[empId];

      const sheet = workbook.addWorksheet(
        `${emp.name}_${empId}`.substring(0, 31)
      );

      /* ---------- TITLE ---------- */
      sheet.mergeCells("A1:K1");
      sheet.getCell("A1").value = `${emp.name} - Attendance Report`;
      sheet.getCell("A1").font = { size: 18, bold: true, color: { argb: "FF1F4E78" } };
      sheet.getCell("A1").alignment = { horizontal: "center" };

      sheet.mergeCells("A2:K2");
      sheet.getCell("A2").value = `📅 From ${start} To ${end}`;
      sheet.getCell("A2").alignment = { horizontal: "center" };

      /* ---------- HEADER ---------- */
      sheet.getRow(3).values = [
        "Date","In Time","Lunch Start","Lunch End","Break Time","Out Time",
        "Status","Permission","Total Hours","Working Hours","Remark"
      ];

      sheet.columns = [
        { key:"DATE", width:16 },
        { key:"in_time", width:18 },
        { key:"lunch_out", width:18 },
        { key:"lunch_in", width:18 },
        { key:"break_time", width:18 },
        { key:"out_time", width:18 },
        { key:"status", width:16 },
        { key:"permission_time", width:20 },
        { key:"total_hours", width:20 },
        { key:"working_hours", width:20 },
        { key:"remark", width:30 }
      ];

      sheet.getRow(3).eachCell(cell => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF4F81BD" }
        };
        cell.alignment = { horizontal: "center" };
        cell.border = {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" }
        };
      });

      sheet.views = [{ state: 'frozen', ySplit: 3 }];

      /* ---------- SUMMARY VARS ---------- */
      let totalWorkingDays = 0;
      let totalAbsent = 0;
      let totalHolidays = 0;
      let totalWFH = 0;
      let totalHalfDay = 0;
      let totalPermission = 0;
      let totalPermissionMinutes = 0;

      emp.data.forEach((r) => {

        let formattedDate = "";

        if (r.DATE) {
          let d = new Date(r.DATE);
          formattedDate =
            String(d.getDate()).padStart(2,'0') + "-" +
            String(d.getMonth()+1).padStart(2,'0') + "-" +
            d.getFullYear();
        }

        let status = "Absent";

        if (r.holiday_reason) status = "Holiday";
        else if (r.attendance_status) status = r.attendance_status;
        else if (r.in_time) status = "Present";

        if (status === "Holiday") totalHolidays++;
        else if (status === "Absent") totalAbsent++;
        else totalWorkingDays++;

        if (status === "WFH") totalWFH++;
        if (status === "Half Day") totalHalfDay++;
        if (status === "Permission") totalPermission++;

        // 🔥 BREAK TIME CALCULATION
let breakTime = "-";

if(r.lunch_out && r.lunch_in){
  const start = new Date(`1970-01-01T${r.lunch_out}`);
  const end = new Date(`1970-01-01T${r.lunch_in}`);

  const diffMin = Math.floor((end - start) / 60000);

  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;

  breakTime = `${h > 0 ? h + " hr " : ""}${m} min`;
}

        const row = sheet.addRow({
  DATE: formattedDate,
  in_time: formatTime12hr(r.in_time),
  lunch_out: formatTime12hr(r.lunch_out),
  lunch_in: formatTime12hr(r.lunch_in),
  break_time: breakTime,  
  out_time: formatTime12hr(r.out_time),
  permission_time: formatDuration(r.permission_time),
  total_hours: formatDuration(r.total_hours),
  working_hours: formatDuration(r.working_hours),
  status: status,
  remark: r.remark || "-"
});

        /* ---------- ALIGN + BORDER ---------- */
        row.eachCell(cell => {
          cell.alignment = { horizontal: "center" };
          cell.border = {
            top: { style: "thin" },
            bottom: { style: "thin" },
            left: { style: "thin" },
            right: { style: "thin" }
          };
        });

        /* ---------- ALT ROW COLOR ---------- */
        if (row.number % 2 === 0) {
          row.eachCell(cell => {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFF7F9FC" }
            };
          });
        }

        /* ---------- STATUS COLOR ---------- */
        let color = "";

        if (status === "Present" || status === "Full Day") color = "FFCCFFCC";
        if (status === "Permission") color = "FFD9B3FF";
        if (status === "Absent") color = "FFFF9999";
        if (status === "Holiday") color = "FFFFFF99";
        if (status === "Half Day") color = "FFFFCC99";
        if (status === "WFH") color = "FFCCE5FF";

        if (color) {
          row.eachCell(cell => {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: color }
            };
          });
        }

        if (r.permission_time) {
          const [h, m] = r.permission_time.split(":").map(Number);
          totalPermissionMinutes += (h * 60) + m;
        }

      });

      /* ---------- SUMMARY ---------- */
      const totalPermissionHours = Math.floor(totalPermissionMinutes / 60);
      const totalPermissionMinutesRemaining = totalPermissionMinutes % 60;

      const totalPermissionTime = formatDuration(
        `${String(totalPermissionHours).padStart(2,"0")}:${String(totalPermissionMinutesRemaining).padStart(2,"0")}`
      );

      const lastRow = sheet.lastRow.number + 2;

      sheet.getCell(`A${lastRow}`).value = "📊 Summary";
      sheet.getCell(`A${lastRow}`).font = { bold: true, size: 14 };

      const summaryData = [
        ["Total Working Days", totalWorkingDays],
        ["Total Absent", totalAbsent],
        ["Total Holidays", totalHolidays],
        ["Total WFH", totalWFH],
        ["Total Half Days", totalHalfDay],
        ["Total Permissions", totalPermission],
        ["Total Permission Time", totalPermissionTime]
      ];

      summaryData.forEach((item, index) => {
        const row = sheet.addRow(item);

        row.eachCell(cell => {
          cell.border = {
            top: { style: "thin" },
            bottom: { style: "thin" },
            left: { style: "thin" },
            right: { style: "thin" }
          };
        });

        if (index % 2 === 0) {
          row.eachCell(cell => {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFEAF1FB" }
            };
          });
        }
      });

    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=attendance_report.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();

  });

});


/* ---------------- UPDATE EMPLOYEE ---------------- */

app.post("/admin/update-employee",(req,res)=>{

const {id,name,email,department,password}=req.body;

db.query(
`UPDATE employees 
SET NAME=?, email=?, department=?, password=? 
WHERE id=?`,
[name,email,department,password,id],
(err)=>{

if(err) return res.status(500).send("DB Error");

res.send("Employee Updated");

});

});

/* ---------------- UPDATE ATTENDANCE STATUS ---------------- */

app.post("/admin/update-status",(req,res)=>{

let {employee_id,date,status,reason} = req.body;

/* DATE FIX */
const attendanceDate = date || new Date().toLocaleDateString("en-CA");

/* WFH DEFAULT VALUES */
let in_time = null;
let out_time = null;
let total_hours = null;
let working_hours = null;

if(status === "WFH"){
  in_time = "10:15:00";
  out_time = "19:15:00";
  total_hours = "09:00";
  working_hours = "09:00";
}

db.query(`
INSERT INTO attendance
(employee_id, DATE, in_time, out_time, total_hours, working_hours, attendance_status, permission_type)
VALUES (?,?,?,?,?,?,?,?)
ON DUPLICATE KEY UPDATE
attendance_status=VALUES(attendance_status),
permission_type=VALUES(permission_type),
in_time=VALUES(in_time),
out_time=VALUES(out_time),
total_hours=VALUES(total_hours),
working_hours=VALUES(working_hours)
`,
[
employee_id,
attendanceDate,
in_time,
out_time,
total_hours,
working_hours,
status,
reason || null
],
(err)=>{
  if(err){
    console.log(err);
    return res.status(500).send("DB Error");
  }

  res.send("Status Saved Successfully");
});

});


/* ---------------- UPCOMING HOLIDAYS ---------------- */

app.get("/admin/upcoming-holidays",(req,res)=>{

const today = new Date().toISOString().split("T")[0];

db.query(
"SELECT holiday_date, reason FROM holidays WHERE holiday_date >= ? ORDER BY holiday_date ASC LIMIT 5",
[today],
(err,results)=>{

if(err) return res.status(500).send("DB Error");

res.json(results);

});

});


/* ---------------- DELETE EMPLOYEE ---------------- */

app.post("/admin/delete-employee",(req,res)=>{

const {id}=req.body;

db.query(
"DELETE FROM employees WHERE id=?",
[id],
(err)=>{

if(err) return res.status(500).send("DB Error");

res.send("Employee Deleted");

});

});




app.post("/admin/update-attendance",(req,res)=>{

const {
employee_id,
date,
in_time,
lunch_out,
lunch_in,
out_time,
permission_type,
permission_time,
attendance_status,
remark
} = req.body;

/* 🔥 SAFETY LOG */
console.log("UPDATE ATTENDANCE:", req.body);

/* 🔥 DATE FIX (IST SAFE) */
const attendanceDate = date || new Date().toLocaleDateString("en-CA");

db.query(`
INSERT INTO attendance
(employee_id, DATE, in_time, lunch_out, lunch_in, out_time, permission_type, permission_time, attendance_status , remark)
VALUES (?,?,?,?,?,?,?,?,?,?)
ON DUPLICATE KEY UPDATE
in_time=VALUES(in_time),
lunch_out=VALUES(lunch_out),
lunch_in=VALUES(lunch_in),
out_time=VALUES(out_time),
permission_type=VALUES(permission_type),
permission_time=VALUES(permission_time),
attendance_status=VALUES(attendance_status),
remark=VALUES(remark)
`,
[
employee_id,
attendanceDate,
in_time || null,
lunch_out || null,
lunch_in || null,
out_time || null,
permission_type || null,
permission_time || null,
attendance_status || null,
remark || null
],
(err,result)=>{
  if(err){
    console.log("DB ERROR:", err);
    return res.status(500).json({success:false});
  }

  /* 🔥 CHECK INSERT or UPDATE */
  const action = result.affectedRows === 1 ? "INSERTED" : "UPDATED";

  res.json({
    success:true,
    message:`Attendance ${action}`
  });
});

});
