import asyncio
import csv
from mee6_py_api import API

GUILD_ID = "1114437735692902481"

TOTAL_USERS = 10000
USERS_PER_PAGE = 100
DELAY = 0.6  # seconds between requests (adjust if needed)


async def main():
    mee6API = API(GUILD_ID)

    total_pages = TOTAL_USERS // USERS_PER_PAGE

    with open("leaderboard.csv", "w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(["Rank", "UserID", "Username", "Level", "XP", "Messages"])

        rank = 1

        for page in range(total_pages):
            try:
                print(f"Fetching page {page}...")

                data = await mee6API.levels.get_leaderboard_page(page)

                players = data.get("players", [])

                if not players:
                    print("No more data. Stopping early.")
                    break

                for user in players:
                    writer.writerow([
                        rank,
                        user.get("id"),  # 👈 THIS is the only thing you needed
                        user.get("username"),
                        user.get("level"),
                        user.get("xp"),
                        user.get("message_count")
                    ])
                    rank += 1

                # 🚨 Rate limit protection
                await asyncio.sleep(DELAY)

            except Exception as e:
                print(f"Error on page {page}:", e)
                print("Retrying after delay...")
                await asyncio.sleep(2)
                continue

    print("✅ Done. Saved to leaderboard.csv")


if __name__ == "__main__":
    asyncio.run(main())