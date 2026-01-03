const nodemailer = require('nodemailer');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { articleId, userName, userEmail, diffSummary } = req.body;

  // 環境変数からメール設定を取得
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const notificationEmail = process.env.NOTIFICATION_EMAIL || gmailUser; // 送信先（指定がなければ自分宛て）

  if (!gmailUser || !gmailPass) {
    console.error('Gmail credentials not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // トランスポーターの作成
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  });

  // メールの内容
  const mailOptions = {
    from: `"AIO PDCA System" <${gmailUser}>`,
    to: notificationEmail,
    subject: `【提案通知】${userName}さんが記事を編集しました`,
    text: `
以下の記事に新しい提案（編集履歴）が追加されました。

編集者: ${userName} (${userEmail})
記事ID: ${articleId}
日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}

変更概要:
${diffSummary}

システムを確認して承認または却下を行ってください。
    `,
    html: `
      <h2>新しい提案が追加されました</h2>
      <p>以下の記事に編集履歴が記録されました。</p>
      <ul>
        <li><strong>編集者:</strong> ${userName} (${userEmail})</li>
        <li><strong>記事ID:</strong> ${articleId}</li>
        <li><strong>日時:</strong> ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</li>
      </ul>
      <h3>変更概要</h3>
      <pre style="background: #f4f4f5; padding: 10px; border-radius: 5px;">${diffSummary}</pre>
      <p><a href="https://aio-friendly.vercel.app/">システムを開く</a></p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Email send error:', error);
    return res.status(500).json({ error: 'Failed to send email', details: error.message });
  }
}

