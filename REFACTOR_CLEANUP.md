# リポジトリクリーンアップ案

推奨 .gitignore 追加例（プロジェクトルートに追加）:

```
# Node
node_modules/
package-lock.json

# Next/Vite/TS
.next/
.vitest/
coverage/
dist/
build/
*.tsbuildinfo

# Python virtualenv
.venv/
.venv-convert/

# Editor
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Large data/backups
public/backup/
public/cpi_source/*.xls
public/cpi_source/*.xlsx
```

追加提案:

- public/cpi_source や large CSV は可能なら外部ストレージに移動する（S3 等）。
- 既にコミットされている大ファイルは git-filter-repo 等で履歴から削除を検討。
- coverage/やbuild成果物をリポジトリから削除して CI で生成する。
