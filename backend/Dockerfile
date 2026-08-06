# Python 버전은 CI(.github/workflows/ci.yml)와 동일하게 3.12로 고정한다.
FROM python:3.12-slim

WORKDIR /app

# 의존성을 먼저 복사해 레이어 캐시가 소스 변경에 무효화되지 않게 한다.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 업로드 디렉토리는 compose에서 볼륨으로 덮이지만,
# 볼륨 없이 단독 실행하는 경우를 위해 미리 만들어 둔다.
RUN mkdir -p /app/uploads

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
