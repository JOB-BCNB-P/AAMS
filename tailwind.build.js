/* ตั้งค่าคอมไพล์ไฟล์ tailwind.css ของโปรเจกต์นี้
   ค่าธีมต้องตรงกับ tailwind.config ใน index.html เสมอ

   วิธีคอมไพล์ใหม่ (ต้องทำทุกครั้งที่เพิ่มคลาสใหม่ในไฟล์ .js หรือ .html)
     npx tailwindcss@3.4.17 -c tailwind.build.js -i tailwind.in.css -o tailwind.css --minify

   ถ้าลืมคอมไพล์ หน้าเว็บจะยังปกติบนเครื่องที่สร้างสไตล์ตอนใช้งานได้
   แต่จะเพี้ยนบน Safari รุ่นก่อนหน้าของ iPad/iPhone */
module.exports = {
  content: [
    './*.html',
    './*.js'
  ],
  theme: {
    extend: {
      fontFamily: { sarabun: ['Sarabun', 'sans-serif'] },
      colors: {
        primary: '#1e6fba', primaryLight: '#e8f4fd', primaryDark: '#14507f',
        accent: '#0ea5e9', surface: '#f0f7ff', border: '#d1e6f9'
      }
    }
  },
  safelist: [
    // คลาสที่ประกอบจากตัวแปรในโค้ด สแกนหาไม่เจอ จึงต้องระบุไว้เอง
    { pattern: /^(grid-cols|col-span)-(1|2|3|4|5|6|7|8|9|10|11|12)$/,
      variants: ['sm', 'md', 'lg', 'xl'] },
    { pattern: /^(bg|text|border|ring)-(red|green|blue|amber|indigo|purple|teal|gray|emerald|sky|rose|orange)-(50|100|200|300|400|500|600|700|800)$/ }
  ],
  plugins: []
};
