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

let totalMinutes=Math.round(diff/60000)

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

const officeStart = "10:30:00";
const lateLimit = "12:30:00";
const halfDayLimit = "14:00:00";

const lunchStart = "13:00:00";
const lunchEnd = "15:00:00";


/* ---------------- LOGIN ---------------- */

app.post("/login",(req,res)=>{

const {email,password}=req.body;

/* 1️⃣ Check email first */
const sql="SELECT * FROM employees WHERE email=?";

db.query(sql,[email],(err,result)=>{

if(err) return res.status(500).send("DB error");

/* ❌ Email not found */
if(result.length===0){
return res.json({error:"Email not registered"});
}

const user=result[0];

/* ❌ Password wrong */
if(user.password !== password){
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

app.post("/mark-attendance",(req,res)=>{

const {employee_id,type} = req.body;

const now = new Date();
const ist = new Date(now.toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));

const today = ist.toISOString().split("T")[0];
const currentTime = ist.toTimeString().split(" ")[0];

db.query(
"SELECT * FROM attendance WHERE employee_id=? AND DATE=?",
[employee_id,today],
(err,results)=>{

if(err) return res.status(500).send("DB Error");


/* ---------------- IN TIME ---------------- */

if(type==="IN"){

if(results.length>0){
return res.send("IN already marked");
}

let permissionType=null;
let permissionTime=null;
let status="Present";

if(currentTime <= "10:30:00"){

status="Present";

}

else if(currentTime > "10:30:00" && currentTime <= "12:30:00"){

status="Present";
permissionType="Late Entry";
permissionTime=timeDiff("10:30:00",currentTime);

}

else{

status="Half Day";
permissionType="Half Day";

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


/* ---------------- PERMISSION ---------------- */

if(type==="PERMISSION"){

if(results.length===0){
return res.send("Mark IN first");
}

const r=results[0];

if(r.permission_type==="Permission"){
return res.send("Permission already marked");
}

if(r.out_time){
return res.send("Day already closed");
}

/* current time detect */

let permissionStart=currentTime;

/* calculate work until permission */

let totalHours=timeDiff(r.in_time,permissionStart);

let breakTime="00:00";

if(r.lunch_out && r.lunch_in){
breakTime=timeDiff(r.lunch_out,r.lunch_in);
}

let workingHours=calcWorking(totalHours,breakTime);

/* permission hours */

let permissionTime=timeDiff(permissionStart,"19:00:00");

db.query(
`UPDATE attendance
SET 
permission_type='Permission',
permission_time=?,
out_time=?,
total_hours=?,
working_hours=?,
attendance_status='Completed'
WHERE id=?`,
[
permissionTime,
permissionStart,
totalHours,
workingHours,
r.id
],
()=>res.send("Afternoon Permission Marked - Day Closed")
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

let workingHours=calcWorking(totalHours,breakTime);

db.query(
`UPDATE attendance
SET out_time=?, total_hours=?, working_hours=?, attendance_status='Completed'
WHERE id=?`,
[
currentTime,
totalHours,
workingHours,
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
h.reason as holiday_reason
FROM employees e
LEFT JOIN attendance a
ON e.id=a.employee_id AND a.DATE=?
LEFT JOIN holidays h
ON h.holiday_date=?
ORDER BY e.NAME ASC
`;

db.query(sql,[date,date],(err,results)=>{

if(err) return res.status(500).send("DB Error");

const data = results.map(r=>{

let status="Absent";

/* Holiday */

if(r.holiday_reason){
status="Holiday";
}

/* Attendance */

if(r.attendance_status){
status=r.attendance_status;
}

/* Present */

if(r.in_time && !r.out_time){
status="Present";
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
"SELECT COUNT(*) as total FROM employees",
(err,total)=>{

db.query(
"SELECT COUNT(DISTINCT employee_id) as present FROM attendance WHERE DATE=?",
[today],
(err,present)=>{

res.json({
total:total[0].total,
present:present[0].present,
absent:total[0].total-present[0].present
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
ORDER BY e.NAME ASC
`;

db.query(sql,[today],(err,results)=>{

if(err) return res.status(500).send("DB Error");

let data = results.map(r=>{

let status="Absent";
let time=null;

if(r.permission_type==="Half Day"){

if(r.in_time && !r.out_time){
status="Half Day Working";
time=r.in_time;
}

else if(r.out_time){
status="OUT";
time=r.out_time;
}

}

else{

if(r.out_time){
status="OUT";
time=r.out_time;
}

else if(r.in_time && !r.lunch_out){
status="IN";
time=r.in_time;
}

else if(r.lunch_out && !r.lunch_in){
status="Lunch Break";
time=r.lunch_out;
}

else if(r.lunch_in && !r.out_time){
status="Working";
time=r.lunch_in;
}

}

return {
id:r.id,
name:r.NAME,
department:r.department,
status,
time,
lunch_start:r.lunch_out,
lunch_end:r.lunch_in
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
        last_scan_type = "LUNCH IN";
        last_scan_time = r.lunch_in;
      }
      else if (r.lunch_out) {
        status = "LUNCH BREAK";
        last_scan_type = "LUNCH OUT";
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
        last_scan_time
      });
    }
  );
});


/* ---------------- ADD EMPLOYEE ---------------- */
app.post("/admin/add-employee",(req,res)=>{

const {name,email,password,department}=req.body;

db.query(
"INSERT INTO employees(NAME,department,email,password,role) VALUES(?,?,?,?,?)",
[name,department,email,password,"employee"],
(err)=>{

if(err){
console.log(err);
return res.status(500).send("DB Error");
}

res.send("Employee Added");

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

const {start, end} = req.query;

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
h.reason AS holiday_reason

FROM employees e

CROSS JOIN dates d

LEFT JOIN attendance a
ON e.id = a.employee_id
AND a.DATE = d.date

LEFT JOIN holidays h
ON h.holiday_date = d.date

ORDER BY e.NAME, d.date
`;

db.query(sql,[start,end], async (err,rows)=>{

if(err) return res.status(500).send("DB Error");

const workbook = new ExcelJS.Workbook();

const sheet = workbook.addWorksheet("Daily Attendance");

sheet.columns = [

{header:"Employee ID",key:"id",width:12},
{header:"Name",key:"NAME",width:20},
{header:"Department",key:"department",width:20},
{header:"Date",key:"DATE",width:15},
{header:"In Time",key:"in_time",width:12},
{header:"Lunch Start",key:"lunch_out",width:12},
{header:"Lunch End",key:"lunch_in",width:12},
{header:"Out Time",key:"out_time",width:12},
{header:"Status",key:"status",width:15},
{header:"Permission Hours",key:"permission_time",width:15},
{header:"Total Hours",key:"total_hours",width:15},
{header:"Working Hours",key:"working_hours",width:15}

];

/* FILTER */

sheet.autoFilter = {
from:'B1',
to:'B1'
};

/* HEADER STYLE */

sheet.getRow(1).eachCell(cell=>{
cell.font={bold:true,color:{argb:"FFFFFFFF"}};
cell.fill={
type:"pattern",
pattern:"solid",
fgColor:{argb:"FF2F75B5"}
};
cell.alignment={horizontal:"center"};
});

rows.forEach((r,index)=>{

let formattedDate="";

if(r.DATE){
let d=new Date(r.DATE);

formattedDate=
String(d.getDate()).padStart(2,'0')+"-"+ 
String(d.getMonth()+1).padStart(2,'0')+"-"+ 
d.getFullYear();
}

/* STATUS */

let status="Absent";

if(r.holiday_reason){
status="Holiday";
}
else if(r.attendance_status){
status=r.attendance_status;
}
else if(r.in_time){
status="Working";
}

const row=sheet.addRow({

id:r.id,
NAME:r.NAME,
department:r.department,
DATE:formattedDate,
in_time:r.in_time,
lunch_out:r.lunch_out,
lunch_in:r.lunch_in,
out_time:r.out_time,
status:status,
permission_time:r.permission_time,
total_hours:r.total_hours,
working_hours:r.working_hours

});

/* ALTERNATE ROW COLOR */

if(index%2===0){
row.eachCell(cell=>{
cell.fill={
type:"pattern",
pattern:"solid",
fgColor:{argb:"FFF2F2F2"}
};
});
}

/* HOLIDAY */

if(status==="Holiday"){
row.getCell(9).fill={
type:"pattern",
pattern:"solid",
fgColor:{argb:"FFFFEB9C"}
};
}

/* ABSENT */

if(status==="Absent"){
row.getCell(9).fill={
type:"pattern",
pattern:"solid",
fgColor:{argb:"FFFF9999"}
};
}

/* COMPLETED */

if(status==="Completed"){
row.getCell(9).fill={
type:"pattern",
pattern:"solid",
fgColor:{argb:"FF92D050"}
};
}

});


/* ===================== */
/* MONTH SUMMARY */
/* ===================== */

const summarySheet=workbook.addWorksheet("Monthly Summary");

summarySheet.columns=[

{header:"Employee ID",key:"id"},
{header:"Name",key:"name"},
{header:"Department",key:"department"},
{header:"Total Working Hours",key:"working"},
{header:"Total Permission Hours",key:"permission"},
{header:"Total Leave",key:"leave"},
{header:"Total WFH",key:"wfh"}

];

const summary={};

rows.forEach(r=>{

if(!summary[r.id]){

summary[r.id]={
id:r.id,
name:r.NAME,
department:r.department,
working:0,
permission:0,
leave:0,
wfh:0
};

}

if(r.working_hours){

const [h,m]=r.working_hours.split(":").map(Number);
summary[r.id].working+=(h*60)+m;

}

if(r.permission_time){

const [h,m]=r.permission_time.split(":").map(Number);
summary[r.id].permission+=(h*60)+m;

}

if(!r.in_time && !r.holiday_reason){
summary[r.id].leave+=1;
}

if(r.attendance_status==="WFH"){
summary[r.id].wfh+=1;
}

});


Object.values(summary).forEach(emp=>{

summarySheet.addRow({

id:emp.id,
name:emp.name,
department:emp.department,
working:Math.floor(emp.working/60)+":"+String(emp.working%60).padStart(2,"0"),
permission:Math.floor(emp.permission/60)+":"+String(emp.permission%60).padStart(2,"0"),
leave:emp.leave,
wfh:emp.wfh

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

/* ---------- FIX EMPTY DATE ---------- */

let attendanceDate = date;

if(!attendanceDate || attendanceDate==="-" || attendanceDate==="0000-00-00"){
attendanceDate = new Date().toISOString().split("T")[0];
}


/* ---------- CHECK EXISTING RECORD ---------- */

db.query(
"SELECT * FROM attendance WHERE employee_id=? AND DATE=?",
[employee_id,attendanceDate],
(err,result)=>{

if(err) return res.status(500).send("DB Error");


/* ---------- IF NO ATTENDANCE RECORD ---------- */

if(result.length===0){

/* ---------- WFH ---------- */

if(status==="WFH"){

db.query(
`INSERT INTO attendance
(employee_id,DATE,in_time,out_time,total_hours,working_hours,attendance_status)
VALUES (?,?,?,?,?,?,?)`,
[
employee_id,
attendanceDate,
"10:30:00",
"19:00:00",
"08:30",
"08:30",
"WFH"
],
()=>res.send("WFH Added")
);

}


/* ---------- OTHER STATUS ---------- */

else{

db.query(
`INSERT INTO attendance
(employee_id,DATE,attendance_status,permission_type)
VALUES (?,?,?,?)`,
[
employee_id,
attendanceDate,
status,
reason
],
()=>res.send("Status Added")
);

}

}


/* ---------- RECORD EXISTS ---------- */

else{

/* ---------- WFH UPDATE ---------- */

if(status==="WFH"){

db.query(
`UPDATE attendance
SET attendance_status='WFH',
in_time='10:30:00',
out_time='19:00:00',
total_hours='08:30',
working_hours='08:30'
WHERE employee_id=? AND DATE=?`,
[
employee_id,
attendanceDate
],
()=>res.send("WFH Updated")
);

}


/* ---------- OTHER STATUS UPDATE ---------- */

else{

db.query(
`UPDATE attendance
SET attendance_status=?, permission_type=?
WHERE employee_id=? AND DATE=?`,
[
status,
reason,
employee_id,
attendanceDate
],
()=>res.send("Status Updated")
);

}

}

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
attendance_status
}=req.body;

/* CHECK ROW EXIST */

db.query(
"SELECT * FROM attendance WHERE employee_id=? AND DATE=?",
[employee_id,date],
(err,rows)=>{

if(err){
console.log(err);
return res.send("DB Error");
}

/* IF EXIST → UPDATE */

if(rows.length>0){

db.query(`
UPDATE attendance
SET
in_time=?,
lunch_out=?,
lunch_in=?,
out_time=?,
permission_type=?,
permission_time=?,
attendance_status=?
WHERE employee_id=? AND DATE=?`,
[
in_time,
lunch_out,
lunch_in,
out_time,
permission_type,
permission_time,
attendance_status,
employee_id,
date
],()=>{

res.send("Updated Successfully");

});

}

/* IF NOT EXIST → INSERT */

else{

db.query(`
INSERT INTO attendance
(employee_id,DATE,attendance_status)
VALUES (?,?,?)`,
[
employee_id,
date,
attendance_status
],()=>{

res.send("WFH / Leave Added");

});

}

});

});