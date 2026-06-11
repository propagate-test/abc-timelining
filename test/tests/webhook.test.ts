import { POST } from "@/app/api/story/webhook/route"; 
import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/telegram", () => ({
  setMessageReaction: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/services/pipeline/execute", () => ({
  executePipelineActions: jest.fn().mockResolvedValue(undefined),
}));

// Mock Redis client
jest.mock("@upstash/redis", () => ({
  Redis: jest.fn().mockImplementation(() => ({
    lpush: jest.fn().mockResolvedValue(1),
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
  })),
}));

jest.mock("@/lib/redis", () => ({
  redis: {
    lpush: jest.fn().mockResolvedValue(1),
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
  },
}));

// Mock Axios for Telegram API and organising webhook forwarding
jest.mock("axios", () => ({
  create: jest.fn(() => ({
    post: jest.fn().mockResolvedValue({ data: { ok: true } })
  })),
  post: jest.fn().mockResolvedValue({ data: { ok: true } }),
}));

describe("Telegram Webhook API", () => {
  let mockReq: NextRequest;
  let mockRes: NextResponse;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    mockRes = {
      json: jsonMock,
      status: statusMock,
    } as unknown as NextResponse;
  });

  it("should return 405 for non-POST requests", async () => {
    const mockReq = new NextRequest('http://localhost/', { method: "GET" });
    const res = await POST(mockReq);
  
    expect(res.status).toBe(405);
  });

  it("should queue a valid message and return 'ok'", async () => {
    // Create a mock Request
    const req = new NextRequest('http://localhost/', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          chat: { id: 12345, type: 'private' },
          message_id: 1,
          text: "Hello",
        },
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
  });

  it("should queue a reply to an older forum message and return 'ok'", async () => {
    const req = new NextRequest('http://localhost/', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          chat: { id: 12345, type: 'supergroup' },
          message_id: 3,
          message_thread_id: 10,
          text: 'Reply in thread',
          reply_to_message: {
            message_id: 2,
            text: 'older message',
            reply_to_message: {
              message_id: 10,
              forum_topic_created: { name: '_botEnrolment' },
            },
          },
        },
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
  });
});
