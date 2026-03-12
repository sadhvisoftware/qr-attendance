const mysql = require("mysql2");

const connection = mysql.createConnection(process.env.MYSQL_URL);

connection.connect((err)=>{
if(err){
console.error("DB Connection Failed:",err);
}else{
console.log("MySQL Connected ✅");
}
});

module.exports = connection;