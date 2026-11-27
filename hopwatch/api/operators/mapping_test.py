import asyncio

from hopwatch.api.operators.mapping import MAX_REMEMBERED, Operator, operator_from, Operators


def test_operator_of_a_stop_time():
    record = {"agencyId": "1161", "agencyName": "SŽ - Potniški promet, d.o.o.", "agencyUrl": "https://potniski.sz.si/"}
    assert operator_from(record) == Operator(
        id="1161", name="SŽ - Potniški promet, d.o.o.", url="https://potniski.sz.si/"
    )


def test_operator_without_name_or_url():
    assert operator_from({"agencyId": "7"}) == Operator(id="7", name="7", url=None)


def test_no_operator_without_an_id():
    assert operator_from({"agencyName": "Nobody"}) is None
    assert operator_from({}) is None


def test_remembered_operator_replaces_none_and_is_bounded():
    operators = Operators(list)
    operators.remember([None, Operator(id="1", name="Old", url=None), Operator(id="1", name="New", url=None)])
    assert asyncio.run(operators.all()) == [Operator(id="1", name="New", url=None)]

    operators.remember(Operator(id=str(index), name="x", url=None) for index in range(2, MAX_REMEMBERED + 10))
    assert len(asyncio.run(operators.all())) == MAX_REMEMBERED
