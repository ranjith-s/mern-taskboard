// Demo data: `npm run seed` -> log in as asha@demo.com / password123
const mongoose = require('mongoose');
const env = require('./config/env');
const User = require('./models/User');
const Board = require('./models/Board');
const List = require('./models/List');
const Card = require('./models/Card');
const Activity = require('./models/Activity');
const RefreshToken = require('./models/RefreshToken');
const { GAP } = require('./utils/position');

async function seed() {
  await mongoose.connect(env.MONGO_URI);
  await Promise.all([User, Board, List, Card, Activity, RefreshToken].map((m) => m.deleteMany({})));

  const [asha, ravi, priya] = await User.create([
    { name: 'Asha Iyer', email: 'asha@demo.com', password: 'password123' },
    { name: 'Ravi Kumar', email: 'ravi@demo.com', password: 'password123' },
    { name: 'Priya Shah', email: 'priya@demo.com', password: 'password123' },
  ]);

  const board = await Board.create({
    title: 'Product Launch',
    description: 'Tasks for the v1 launch',
    owner: asha._id,
    members: [
      { user: asha._id, role: 'owner' },
      { user: ravi._id, role: 'member' },
      { user: priya._id, role: 'viewer' },
    ],
  });

  const lists = await List.insertMany(
    ['To Do', 'In Progress', 'Done'].map((title, i) => ({ board: board._id, title, position: (i + 1) * GAP }))
  );

  const cards = [
    [0, 'Design landing page', [asha], ['design']],
    [0, 'Set up payment gateway', [ravi], ['backend']],
    [0, 'Write API docs', [], ['docs']],
    [1, 'Implement JWT refresh flow', [ravi], ['backend', 'security']],
    [1, 'Board drag and drop', [asha], ['frontend']],
    [2, 'Project setup', [asha, ravi], []],
  ];
  const perList = [0, 0, 0];
  await Card.insertMany(
    cards.map(([li, title, assignees, labels]) => ({
      board: board._id,
      list: lists[li]._id,
      title,
      assignees: assignees.map((u) => u._id),
      labels,
      position: ++perList[li] * GAP,
      completed: li === 2,
      dueDate: li === 0 ? new Date(Date.now() + 3 * 864e5) : null,
      createdBy: asha._id,
    }))
  );

  console.log('Seeded. Log in with asha@demo.com / ravi@demo.com / priya@demo.com, password: password123');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
