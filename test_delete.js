const id = process.argv[2];
const type = process.argv[3];
const url = type === 'employee' 
  ? `http://localhost:3000/api/employees?id=${id}` 
  : `http://localhost:3000/api/${type}/${id}`;

fetch(url, { method: "DELETE" })
  .then(res => res.text().then(text => ({ status: res.status, text })))
  .then(console.log)
  .catch(console.error);
