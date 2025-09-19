#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
모든 선박의 정박/어장 위치를 EUM001, EUM002 근처로 업데이트하는 스크립트
"""

import sqlite3
import random

# 데이터베이스 연결
conn = sqlite3.connect('ship_routes.db')
cursor = conn.cursor()

# EUM001, EUM002의 현재 위치 확인
cursor.execute("SELECT ship_id, fishing_area_lat, fishing_area_lng, docking_lat, docking_lng FROM ships WHERE ship_id IN ('EUM001', 'EUM002')")
reference_ships = cursor.fetchall()

print("기준 선박 위치:")
for ship in reference_ships:
    print(f"{ship[0]}: 어장({ship[1]}, {ship[2]}), 정박({ship[3]}, {ship[4]})")

# 기준 위치 설정 (EUM001, EUM002의 평균 위치 근처)
# 만약 EUM001, EUM002에 데이터가 없으면 부산항 근처 기본값 사용
if reference_ships and reference_ships[0][1]:
    base_fishing_lat = 35.93  # 어장 기준 위도
    base_fishing_lng = 129.60  # 어장 기준 경도
    base_docking_lat = 35.95  # 정박 기준 위도
    base_docking_lng = 129.56  # 정박 기준 경도
else:
    # 부산항 근처 기본값
    base_fishing_lat = 35.10  # 부산항 남쪽 어장
    base_fishing_lng = 129.10
    base_docking_lat = 35.12  # 부산항 근처 정박지
    base_docking_lng = 129.04

# 모든 선박 조회
cursor.execute("SELECT ship_id, type FROM ships")
all_ships = cursor.fetchall()

print("\n모든 선박 위치 업데이트 중...")

for ship_id, ship_type in all_ships:
    # 각 선박마다 기준 위치에서 약간 랜덤하게 분산
    # 어선은 어장 위치도 설정
    if ship_type == '어선':
        # 어장 위치 (기준점에서 0.01도 범위 내 랜덤)
        fishing_lat = base_fishing_lat + random.uniform(-0.01, 0.01)
        fishing_lng = base_fishing_lng + random.uniform(-0.01, 0.01)

        # 정박 위치 (기준점에서 0.005도 범위 내 랜덤)
        docking_lat = base_docking_lat + random.uniform(-0.005, 0.005)
        docking_lng = base_docking_lng + random.uniform(-0.005, 0.005)

        cursor.execute("""
            UPDATE ships
            SET fishing_area_lat = ?, fishing_area_lng = ?,
                docking_lat = ?, docking_lng = ?
            WHERE ship_id = ?
        """, (fishing_lat, fishing_lng, docking_lat, docking_lng, ship_id))

        print(f"  {ship_id} (어선): 어장({fishing_lat:.6f}, {fishing_lng:.6f}), 정박({docking_lat:.6f}, {docking_lng:.6f})")
    else:
        # 어선이 아닌 경우 정박 위치만 설정
        docking_lat = base_docking_lat + random.uniform(-0.008, 0.008)
        docking_lng = base_docking_lng + random.uniform(-0.008, 0.008)

        cursor.execute("""
            UPDATE ships
            SET docking_lat = ?, docking_lng = ?
            WHERE ship_id = ?
        """, (docking_lat, docking_lng, ship_id))

        print(f"  {ship_id} ({ship_type}): 정박({docking_lat:.6f}, {docking_lng:.6f})")

# 변경사항 저장
conn.commit()
print("\n✅ 모든 선박 위치가 업데이트되었습니다.")

# 업데이트된 데이터 확인
cursor.execute("SELECT ship_id, type, fishing_area_lat, fishing_area_lng, docking_lat, docking_lng FROM ships LIMIT 10")
updated_ships = cursor.fetchall()

print("\n업데이트된 선박 데이터 (처음 10개):")
for ship in updated_ships:
    if ship[2] and ship[3]:  # 어장 위치가 있는 경우
        print(f"  {ship[0]} ({ship[1]}): 어장({ship[2]:.4f}, {ship[3]:.4f}), 정박({ship[4]:.4f}, {ship[5]:.4f})")
    else:
        print(f"  {ship[0]} ({ship[1]}): 정박({ship[4]:.4f}, {ship[5]:.4f})")

conn.close()
print("\n데이터베이스가 닫혔습니다.")