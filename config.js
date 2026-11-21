/* ==================================================================
   CamLock — ตั้งค่าการเชื่อมต่อ ThingsBoard
   ดูวิธีหาค่าแต่ละช่องใน README.md หัวข้อ "ตั้งค่า ThingsBoard"
   ================================================================== */
window.CAMLOCK_CONFIG = {
  // เซิร์ฟเวอร์ ThingsBoard
  tbUrl: 'https://thingsboard.cloud',

  // Device ID ของตู้ (Devices > เลือกอุปกรณ์ > Copy device ID)  ไม่ใช่ Access token
  deviceId: '',

  // บัญชี Customer user ที่สร้างไว้ให้แอปใช้โดยเฉพาะ (เห็นได้แค่อุปกรณ์ตู้นี้)
  // ห้ามใช้บัญชี Tenant administrator ของตัวเอง เพราะไฟล์นี้ใครก็เปิดอ่านได้
  tbUsername: '',
  tbPassword: '',

  // ลิงก์ของแอป ใช้ทำ QR ติดหน้าตู้
  appUrl: 'https://benharry12.github.io/camlock-app/'
};
