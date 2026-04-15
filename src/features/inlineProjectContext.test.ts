import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCurrentFileStructureContext,
  selectSimilarFileSampleContext,
  type SimilarFileCandidate,
} from './inlineProjectContext';

test('buildCurrentFileStructureContext extracts compact declaration summaries', () => {
  const context = buildCurrentFileStructureContext({
    filename: 'puzzle_page.dart',
    text: `class PuzzlePage extends StatefulWidget {
  const PuzzlePage({super.key});
}

class _PuzzlePageState extends State<PuzzlePage> {
  void _shuffleTiles() {
    final values = <int>[];
    values.add(1);
  }

  void _checkWin() {
    bool solved = true;
    if (solved) {
      _gameOver();
    }
  }

  void _gameOver() {
    showDialog(context: context, builder: (_) => const SizedBox());
  }
}`,
  });

  assert.match(context, /Current file structure: puzzle_page\.dart/);
  assert.match(context, /class PuzzlePage extends StatefulWidget/);
  assert.match(context, /class _PuzzlePageState extends State<PuzzlePage>/);
  assert.match(context, /void _checkWin\(\)/);
  assert.doesNotMatch(context, /values\.add\(1\)/);
  assert.ok(context.length <= 700);
});

test('buildCurrentFileStructureContext returns empty when no useful declarations exist', () => {
  const context = buildCurrentFileStructureContext({
    filename: 'notes.txt',
    text: 'just some loose text without declarations',
  });

  assert.equal(context, '');
});

test('selectSimilarFileSampleContext prefers an open same-language candidate with strong overlap', () => {
  const candidates: SimilarFileCandidate[] = [
    {
      uri: 'file:///repo/user_profile_page.dart',
      filename: 'user_profile_page.dart',
      language: 'dart',
      isOpen: true,
      text: `class UserProfilePage extends StatefulWidget {
  const UserProfilePage({super.key});
}

class _UserProfilePageState extends State<UserProfilePage> {
  void _saveProfile() {
    setState(() {
      _isSaving = false;
    });
  }
}`,
    },
    {
      uri: 'file:///repo/http_client.dart',
      filename: 'http_client.dart',
      language: 'dart',
      isOpen: true,
      text: 'class HttpClient {}',
    },
  ];

  const selection = selectSimilarFileSampleContext({
    currentUri: 'file:///repo/puzzle_page.dart',
    currentFilename: 'puzzle_page.dart',
    language: 'dart',
    referencedWords: ['ProfilePage', 'saveProfile'],
    candidates,
  });

  assert.equal(selection.selectedUri, 'file:///repo/user_profile_page.dart');
  assert.match(selection.value, /Similar file sample: user_profile_page\.dart/);
  assert.match(selection.value, /void _saveProfile\(\)/);
  assert.ok(selection.value.length <= 900);
});

test('selectSimilarFileSampleContext skips weak candidates', () => {
  const candidates: SimilarFileCandidate[] = [
    {
      uri: 'file:///repo/logger.dart',
      filename: 'logger.dart',
      language: 'dart',
      isOpen: false,
      text: 'class Logger {}',
    },
  ];

  const selection = selectSimilarFileSampleContext({
    currentUri: 'file:///repo/puzzle_page.dart',
    currentFilename: 'puzzle_page.dart',
    language: 'dart',
    referencedWords: ['PuzzleBoard'],
    candidates,
  });

  assert.equal(selection.value, '');
  assert.equal(selection.selectedUri, undefined);
});
