// Local contract fixtures for public/app.mjs, never loaded by the NestJS app.
const http = require('http');
const { randomUUID } = require('crypto');
const stamp = () => new Date().toISOString();
function seed() {
  const receipt = {
    id: '11111111-1111-4111-8111-111111111111',
    ingestionJobId: null,
    merchant: 'Green Basket',
    purchasedAt: '2026-10-29T10:30:00.000Z',
    total: 185000,
    tax: null,
    currency: 'VND',
    updatedAt: stamp(),
    revision: 1,
    lineItems: [
      {
        name: 'Fresh vegetables',
        quantity: 1,
        unitPrice: 85000,
        totalPrice: 85000,
        category: 'food',
      },
      {
        name: 'Rice',
        quantity: 2,
        unitPrice: 50000,
        totalPrice: 100000,
        category: 'food',
      },
    ],
  };
  const reviewReceipt = {
    merchant: 'Corner Coffee',
    purchasedAt: '2026-10-30T02:00:00.000Z',
    total: 45000,
    tax: null,
    currency: 'VND',
    confidence: 0.7,
    discrepancy: null,
    lineItems: [
      { name: 'Coffee', quantity: 1, unitPrice: 45000, totalPrice: 45000 },
    ],
  };
  const job = (id, name, classification, metadata) => ({
    id,
    originalFilename: name,
    classification,
    status: 'needs_review',
    mimeType: 'image/jpeg',
    createdAt: stamp(),
    updatedAt: stamp(),
    errorMessage: null,
    metadata,
  });
  return {
    sessions: [],
    messages: [],
    receipts: [receipt],
    jobs: [
      job(
        '22222222-2222-4222-8222-222222222222',
        'coffee-receipt.jpg',
        'receipt',
        {
          needsReview: {
            receipt: reviewReceipt,
            confidence: 0.7,
            status: 'pending',
            requestedAt: stamp(),
            rawText: null,
          },
        },
      ),
      job(
        '33333333-3333-4333-8333-333333333333',
        'bank-transfer.jpg',
        'payment',
        {
          paymentReview: {
            payment: {
              merchant: 'Utility provider',
              purchasedAt: '2026-10-29T04:30:00.000Z',
              total: 350000,
              currency: 'VND',
              confidence: 0.9,
            },
            status: 'pending',
            requestedAt: stamp(),
            rawText: null,
          },
        },
      ),
    ],
    targets: {},
    sequence: 0,
    mode: null,
  };
}
http
  .createServer(async (req, res) => {
    let data = await pm.state.get('spending.data');
    if (!data) data = seed();
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    const body = req.body ?? {};
    async function send(payload, status = 200) {
      await pm.state.set('spending.data', data);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: status < 400 ? 'success' : 'error',
          message: status < 400 ? 'Success' : payload,
          data: status < 400 ? payload : null,
        }),
      );
    }
    if (path === '/_test/reset') {
      data = seed();
      return send({ reset: true });
    }
    if (path === '/_test/mode') {
      data.mode = body.mode;
      return send({ mode: data.mode });
    }
    if (path === '/auth/google') {
      res.writeHead(302, { Location: '/#access_token=fixture-token' });
      return res.end();
    }
    if (path === '/auth/me')
      return send({
        id: 'fixture-owner',
        email: 'owner@example.test',
        name: 'Alex',
      });
    if (path === '/chat/sessions' && req.method === 'POST') {
      const session = {
        id: randomUUID(),
        title: 'New conversation',
        createdAt: stamp(),
        updatedAt: stamp(),
      };
      data.sessions.unshift(session);
      return send(session, 201);
    }
    if (path === '/chat/sessions' && req.method === 'GET') {
      const offset = Number(url.searchParams.get('offset') ?? 0);
      return send({
        sessions: data.sessions.slice(offset, offset + 30),
        nextOffset: data.sessions.length > offset + 30 ? offset + 30 : null,
      });
    }
    const chat = /^\/chat\/sessions\/([^/]+)(?:\/(messages|uploads))?$/.exec(
      path,
    );
    if (chat) {
      const session = data.sessions.find((row) => row.id === chat[1]);
      if (!session) return send('Chat session not found', 404);
      if (req.method === 'DELETE') {
        data.sessions = data.sessions.filter((row) => row.id !== session.id);
        data.messages = data.messages.filter(
          (row) => row.sessionId !== session.id,
        );
        return send(null);
      }
      if (!chat[2])
        return send({
          session,
          messages: data.messages.filter((row) => row.sessionId === session.id),
          nextBefore: null,
        });
      if (chat[2] === 'messages') {
        if (data.mode === 'chat-error') {
          data.mode = null;
          return send(
            'The assistant is temporarily unavailable. Try again.',
            503,
          );
        }
        const reply =
          'Your saved receipts are ready to explore. **Green Basket** is recorded in VND.\n\nAsk about a time period, merchant, or item to narrow your spending search.';
        data.messages.push(
          {
            id: ++data.sequence,
            sessionId: session.id,
            role: 'user',
            content: body.message,
          },
          {
            id: ++data.sequence,
            sessionId: session.id,
            role: 'assistant',
            content: reply,
          },
        );
        if (session.title === 'New conversation')
          session.title = body.message.slice(0, 80);
        session.updatedAt = stamp();
        return send({ sessionId: session.id, reply });
      }
      const job = data.jobs.find((row) => row.id === body.ingestionJobId);
      if (!job) return send('Upload not found', 404);
      let entry = data.messages.find(
        (row) => row.sessionId === session.id && row.ingestionJobId === job.id,
      );
      if (!entry) {
        entry = {
          id: ++data.sequence,
          sessionId: session.id,
          role: 'upload',
          content: job.originalFilename,
          ingestionJobId: job.id,
        };
        data.messages.push(entry);
      }
      if (session.title === 'New conversation')
        session.title = job.originalFilename;
      return send(entry, 201);
    }
    if (path === '/storage/upload-targets') {
      const key = randomUUID();
      data.targets[key] = body;
      return send({
        storageKey: `raw/fixture-owner/${key}`,
        uploadUrl: `http://127.0.0.1:4187/_test/storage/${key}`,
        uploadHeaders: {
          'Content-Type': body.mimeType,
          'x-amz-meta-original-filename': encodeURIComponent(
            body.originalFilename,
          ),
        },
        expiresInSeconds: 900,
      });
    }
    if (path.startsWith('/_test/storage/')) {
      const target = data.targets[path.split('/').pop()];
      return target?.originalFilename.includes('fail-storage')
        ? send('Storage unavailable', 503)
        : send(null);
    }
    if (path === '/ingest' && req.method === 'POST') {
      const target = data.targets[body.storageKey.split('/').pop()];
      if (!target) return send('Object not found', 404);
      const existing = data.jobs.find(
        (row) => row.checksumSha256 === body.checksumSha256,
      );
      if (existing)
        return send({ job: existing, accepted: true, deduplicated: true }, 201);
      const job = {
        id: randomUUID(),
        originalFilename: target.originalFilename,
        checksumSha256: body.checksumSha256,
        status: 'completed',
        classification: 'receipt',
        metadata: {},
        createdAt: stamp(),
        updatedAt: stamp(),
      };
      data.jobs.unshift(job);
      const receipt = {
        ...data.receipts[0],
        id: randomUUID(),
        ingestionJobId: job.id,
        revision: 1,
      };
      data.receipts.unshift(receipt);
      return send({ job, accepted: true, deduplicated: false }, 201);
    }
    if (path === '/ingest/jobs') {
      const offset = Number(url.searchParams.get('offset') ?? 0);
      return send({
        jobs: data.jobs.slice(offset, offset + 30),
        nextOffset: data.jobs.length > offset + 30 ? offset + 30 : null,
      });
    }
    const jobRoute =
      /^\/ingest\/jobs\/([^/]+)(?:\/(review|payment-review|retry))?$/.exec(
        path,
      );
    if (jobRoute) {
      const job = data.jobs.find((row) => row.id === jobRoute[1]);
      if (!job) return send('Ingestion job not found', 404);
      if (!jobRoute[2]) return send({ job });
      if (jobRoute[2] === 'retry') {
        job.status = 'completed';
        job.updatedAt = stamp();
        return send({ job });
      }
      const review =
        job.metadata[
          jobRoute[2] === 'review' ? 'needsReview' : 'paymentReview'
        ];
      if (!review) return send('Review not found', 404);
      if (req.method === 'GET') return send({ job, review });
      if (review.status !== 'pending')
        return send('This review has already been resolved', 409);
      if (
        !['approve', 'reject'].includes(body.action) ||
        (jobRoute[2] === 'payment-review' &&
          body.action === 'approve' &&
          !body.itemName)
      )
        return send('Invalid review decision', 400);
      review.status = body.action === 'approve' ? 'approved' : 'rejected';
      job.status = body.action === 'approve' ? 'completed' : 'rejected';
      job.updatedAt = stamp();
      if (body.action === 'approve') {
        const receipt = body.receipt ?? {
          ...review.payment,
          tax: null,
          lineItems: [
            {
              name: body.itemName,
              quantity: 1,
              unitPrice: review.payment.total,
              totalPrice: review.payment.total,
            },
          ],
        };
        data.receipts.unshift({
          ...receipt,
          id: randomUUID(),
          ingestionJobId: job.id,
          revision: 1,
          updatedAt: stamp(),
        });
        job.classification = 'receipt';
      }
      return send({ job, review });
    }
    if (path === '/receipts') {
      let receipts = data.receipts;
      const q = url.searchParams.get('q')?.toLowerCase();
      if (q)
        receipts = receipts.filter(
          (row) =>
            row.merchant.toLowerCase().includes(q) ||
            row.lineItems.some((item) => item.name.toLowerCase().includes(q)),
        );
      const jobId = url.searchParams.get('ingestionJobId');
      if (jobId)
        receipts = receipts.filter((row) => row.ingestionJobId === jobId);
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      if (from)
        receipts = receipts.filter(
          (row) =>
            new Date(row.purchasedAt) >= new Date(`${from}T00:00:00+07:00`),
        );
      if (to)
        receipts = receipts.filter(
          (row) =>
            new Date(row.purchasedAt).getTime() <
            new Date(`${to}T00:00:00+07:00`).getTime() + 86400000,
        );
      const offset = Number(url.searchParams.get('offset') ?? 0);
      return send({
        receipts: receipts.slice(offset, offset + 30),
        nextOffset: receipts.length > offset + 30 ? offset + 30 : null,
      });
    }
    const saved = /^\/receipts\/([^/]+)$/.exec(path);
    if (saved) {
      const receipt = data.receipts.find((row) => row.id === saved[1]);
      if (!receipt) return send('Receipt not found', 404);
      if (req.method === 'PATCH') {
        if (data.mode === 'conflict') {
          receipt.revision++;
          data.mode = null;
        }
        if (body.revision !== receipt.revision)
          return send(
            'This receipt changed on another device. Reload it before editing again.',
            409,
          );
        Object.assign(receipt, body.receipt, {
          revision: receipt.revision + 1,
          updatedAt: stamp(),
        });
        return send({ receipt, categorizationQueued: true });
      }
      return send(receipt);
    }
    return send('This endpoint is not modeled by the UI fixture.', 501);
  })
  .listen(process.env.PORT || 4011);
