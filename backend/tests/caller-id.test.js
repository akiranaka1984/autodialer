const request = require('supertest');
const app = require('../src/app');
const db = require('../src/services/database');

let token;
let testCallerId;

beforeAll(async () => {
  // ログインしてトークンを取得
  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({
      username: 'admin',
      password: 'password'
    });
  
  token = loginResponse.body.token;
});

describe('発信者番号API', () => {
  test('新しい発信者番号を作成できる', async () => {
    const newCallerId = {
      number: '0345678901',
      description: 'テスト番号',
      provider: 'テストプロバイダ',
      sip_host: 'sip.test.com',
      auth_username: 'test_user',
      auth_password: 'test_password',
      active: true
    };
    
    const response = await request(app)
      .post('/api/caller-ids')
      .set('Authorization', `Bearer ${token}`)
      .send(newCallerId);
    
    expect(response.statusCode).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.number).toBe(newCallerId.number);
    
    testCallerId = response.body.id;
  });
  
  test('発信者番号一覧を取得できる', async () => {
    const response = await request(app)
      .get('/api/caller-ids')
      .set('Authorization', `Bearer ${token}`);
    
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
  });
  
  test('発信者番号を更新できる', async () => {
    const updatedData = {
      number: '0345678901',
      description: '更新されたテスト番号',
      provider: 'テストプロバイダ',
      active: false
    };
    
    const response = await request(app)
      .put(`/api/caller-ids/${testCallerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(updatedData);
    
    expect(response.statusCode).toBe(200);
    expect(response.body.description).toBe(updatedData.description);
    expect(response.body.active).toBe(updatedData.active);
  });
  
  test('発信者番号を削除できる', async () => {
    const response = await request(app)
      .delete(`/api/caller-ids/${testCallerId}`)
      .set('Authorization', `Bearer ${token}`);
    
    expect(response.statusCode).toBe(200);
    
    // 削除後に取得できないことを確認
    const getResponse = await request(app)
      .get(`/api/caller-ids/${testCallerId}`)
      .set('Authorization', `Bearer ${token}`);
    
    expect(getResponse.statusCode).toBe(404);
  });
});

afterAll(async () => {
  // テスト終了後のクリーンアップ
  await db.close();
});