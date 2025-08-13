const express = require('express');
const path = require('path'); // 需要引入path模块处理路径
const { CozeAPI } = require('@coze/api');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid'); // 用于生成用户标识（可选）
require('dotenv').config(); // 加载环境变量
const app = express();
const port = 3000;

// 配置CORS（与前端匹配）
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());

// 1. 配置当前目录（index文件夹）的静态资源
// 用于访问与back.js同级的其他图片
app.use(express.static(__dirname));


// 初始化CozeAPI（修正baseURL，使用SAT令牌）
const apiClient = new CozeAPI({
  token: process.env.COZE_SAT, // 从环境变量读取SAT
  baseURL: 'https://api.coze.cn' // 修正为正确的基础地址（去掉v2）
});

// 主页返回前端页面
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/frontend copy 3.html');
});

// 聊天接口（融合PAT验证通过的参数结构）
app.post('/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ response: '请输入消息内容' });
  }

  // 生成唯一用户ID，保持会话唯一性
  const userId = uuidv4();
  try {
    // 沿用PAT中验证有效的参数结构
    const response = await apiClient.chat.createAndPoll({
      bot_id: '7521574795335974938', // 你的机器人ID（已验证正确）
      user_id: userId,               // 用户唯一标识
      additional_messages: [         // 核心：使用additional_messages参数（PAT中有效）
        {
          content: message,          // 消息内容
          role: "user",              // 角色（用户）
          content_type: "text",      // 内容类型
          type: "question"           // 消息类型（提问）
        }
      ]
    });

    // 调试日志，观察API响应
    console.log('Coze API响应：', JSON.stringify(response, null, 2)); // 打印完整响应结构

    // 解析聊天机器人回复的内容，兼容几种返回结构
    let botResponse = null;
    if (response.content) {
      botResponse = response.content;
    } else if (response.data && response.data.content) {
      botResponse = response.data.content;
    } else if (response.messages && Array.isArray(response.messages) && response.messages.length > 0) {
      const answerMessages = response.messages.filter(msg => msg.type === 'answer');
      botResponse = answerMessages.length > 0 
        ? answerMessages[answerMessages.length - 1].content
        : response.messages[response.messages.length - 1].content;
    } else if (response.chat && response.chat.last_error) {
      botResponse = response.chat.last_error.msg;
    } else {
      botResponse = '机器人未返回有效内容';
    }

    res.json({ response: botResponse });

  } catch (error) {
    // 捕获并处理异常，打印详细错误信息，帮助排查
    const errorData = error.response?.data; // API返回的错误数据
    const cozeCode = errorData?.code; // 错误码
    const cozeMsg = errorData?.msg || error.message || '未知错误'; // 错误描述
    const requestId = errorData?.request_id; // 请求ID（用于Coze技术支持排查）

    console.error('错误堆栈信息:', error.stack);
    console.error('API返回错误数据:', errorData);
    console.error('请求参数:', { bot_id: '7521574795335974938', user_id: userId, message });
    console.error('Coze错误码:', cozeCode);
    console.error('Coze错误信息:', cozeMsg);
    console.error('请求ID:', requestId);
    
    if (cozeCode) {
      // Coze API 错误
      res.status(500).json({ 
        response: `API错误 (${cozeCode}): ${cozeMsg}`,
        error_code: cozeCode,
        request_id: requestId
      });
    } else {
      // 其他错误
      res.status(500).json({
        response: '抱歉，服务器发生未知错误，请稍后重试。',
      });
    }
  }
});

app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
  console.log(`Coze API 地址：${apiClient.baseURL}`); // 验证baseURL是否正确
  console.log(`环境变量检查：`);
  console.log('COZE_SAT 验证：', process.env.COZE_SAT 
    ? `${process.env.COZE_SAT.slice(0,5)}...${process.env.COZE_SAT.slice(-5)}` 
    : '未设置');
  console.log('- FRONTEND_URL:', process.env.FRONTEND_URL || '默认值 http://localhost:3000');
});